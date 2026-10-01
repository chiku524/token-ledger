/**
 * Sync-run history: recording a run, retaining raw payloads, and reading the
 * history for the operations view. The run row is always kept; raw payloads are
 * pruned to a rolling window because they can be large.
 */
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "./client";
import { syncRunPayloads, syncRuns } from "./schema";
import type { NormalizedBalance, NormalizedSourceTransaction } from "@/adapters/types";

/** Keep raw payloads for the most recent N runs per connection. */
export const RAW_PAYLOAD_RUN_RETENTION = 20;

export type SyncRunStatus = "running" | "ok" | "partial" | "failed" | "not_live";
export type SyncRunTrigger = "manual" | "scheduled" | "webhook" | "cli";

export interface SyncRunRow {
  id: string;
  connectionId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  balancesRead: number;
  movementsRead: number;
  accountsRead: number;
  error: string | null;
}

export interface SyncRunCounts {
  balances: number;
  movements: number;
  accounts: number;
}

/** Start a run. Returns the run id the caller finishes when the pull resolves. */
export async function startSyncRun(
  organizationId: string,
  connectionId: string,
  trigger: SyncRunTrigger,
): Promise<string> {
  const db = getDb();
  const id = `run_${crypto.randomUUID()}`;
  await db.insert(syncRuns).values({
    id,
    organizationId,
    connectionId,
    startedAt: new Date(),
    status: "running",
    trigger,
  });
  return id;
}

export interface FinishSyncRunInput {
  status: Exclude<SyncRunStatus, "running">;
  counts?: SyncRunCounts;
  error?: string | null;
  payloads?: Array<{ kind: "balances" | "movements"; data: readonly NormalizedBalance[] | readonly NormalizedSourceTransaction[] }>;
}

/** Finish a run, optionally retaining its raw payloads. */
export async function finishSyncRun(
  organizationId: string,
  runId: string,
  input: FinishSyncRunInput,
): Promise<void> {
  const db = getDb();
  const connectionId = await db.transaction(async (tx) => {
    const run = (
      await tx.select({ connectionId: syncRuns.connectionId }).from(syncRuns).where(eq(syncRuns.id, runId)).limit(1)
    )[0];
    if (!run) throw new Error("That sync run does not exist.");

    await tx
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        status: input.status,
        balancesRead: input.counts?.balances ?? 0,
        movementsRead: input.counts?.movements ?? 0,
        accountsRead: input.counts?.accounts ?? 0,
        error: input.error ?? null,
      })
      .where(eq(syncRuns.id, runId));

    if (input.payloads && input.payloads.length > 0) {
      await tx.insert(syncRunPayloads).values(
        input.payloads.map((payload) => ({
          id: `runpay_${crypto.randomUUID()}`,
          runId,
          organizationId,
          connectionId: run.connectionId,
          kind: payload.kind,
          payload: serializePayload(payload.data),
        })),
      );
    }
    return run.connectionId;
  });
  // Pruning runs after the transaction commits: a delete inside its own
  // transaction would deadlock on the single-connection pool.
  if (input.payloads && input.payloads.length > 0) {
    await prunePayloads(organizationId, connectionId);
  }
}

/** Recent runs for one connection, newest first. */
export async function recentRunsForConnection(
  organizationId: string,
  connectionId: string,
  limit = 10,
): Promise<SyncRunRow[]> {
  const db = getDb();
  return db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.organizationId, organizationId), eq(syncRuns.connectionId, connectionId)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);
}

/** The most recent run per connection, for the operations view. */
export async function latestRunsByConnection(
  organizationId: string,
  connectionIds: readonly string[],
): Promise<Map<string, SyncRunRow>> {
  if (connectionIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.organizationId, organizationId), inArray(syncRuns.connectionId, [...connectionIds])))
    .orderBy(desc(syncRuns.startedAt));
  const latest = new Map<string, SyncRunRow>();
  for (const row of rows) {
    if (!latest.has(row.connectionId)) latest.set(row.connectionId, row);
  }
  return latest;
}

/**
 * The most recent runs for every connection in an organization, grouped by
 * connection and newest first. Used by the operations view in one query.
 */
export async function recentRunsByOrganization(
  organizationId: string,
  perConnection = 5,
): Promise<Map<string, SyncRunRow[]>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.organizationId, organizationId))
    .orderBy(desc(syncRuns.startedAt));
  const grouped = new Map<string, SyncRunRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.connectionId) ?? [];
    if (list.length < perConnection) {
      list.push(row);
      grouped.set(row.connectionId, list);
    }
  }
  return grouped;
}

/** Raw payloads for one run. */
export async function payloadsForRun(runId: string): Promise<Array<{ kind: string; payload: unknown }>> {
  const db = getDb();
  return db.select({ kind: syncRunPayloads.kind, payload: syncRunPayloads.payload }).from(syncRunPayloads).where(eq(syncRunPayloads.runId, runId));
}

/** Bigint minor units are stored as strings so JSON keeps them exact. */
function serializePayload(data: readonly NormalizedBalance[] | readonly NormalizedSourceTransaction[]): unknown[] {
  return data.map((row) => ({ ...row, quantityMinor: row.quantityMinor.toString() }));
}

/** Delete payloads older than the retention window for a connection. */
async function prunePayloads(organizationId: string, connectionId: string): Promise<void> {
  const db = getDb();
  const keep = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(and(eq(syncRuns.organizationId, organizationId), eq(syncRuns.connectionId, connectionId)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(RAW_PAYLOAD_RUN_RETENTION);
  const keepIds = keep.map((row) => row.id);
  if (keepIds.length === 0) return;
  await db
    .delete(syncRunPayloads)
    .where(and(eq(syncRunPayloads.connectionId, connectionId), notInArray(syncRunPayloads.runId, keepIds)));
}
