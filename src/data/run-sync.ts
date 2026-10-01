/**
 * The one sync path. A manual refresh, a scheduled run, a CLI run, and an
 * operations-page re-run all call `runConnectionSync`, so behaviour and history
 * are identical however a run was started.
 *
 * It is read-only: it pulls balances and movements and stores observations. It
 * never posts a journal. Every run is recorded in `sync_runs`, and a failure
 * moves the connection to `degraded` (a first failure stays `pending`).
 */
import { AdapterNotImplementedError, ConnectionClosedError, pullReadOnly, statusAfterSyncFailure, SYNC_NOT_LIVE } from "@/adapters";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "@/adapters/types";
import { venueDefinition } from "@/adapters/sources/exchange/registry";
import { custodianDefinition } from "@/adapters/sources/custodian/registry";
import { getConnectionCredential, openStoredCredential } from "@/db/credentials";
import {
  finishSyncRun,
  recentRunsForConnection,
  startSyncRun,
  type SyncRunStatus,
  type SyncRunTrigger,
} from "@/db/sync-runs";
import { BooksWriteError, recordSyncFailure, recordSyncSuccess } from "@/db/write";
import type { Books, BooksConnection } from "./books";
import { booksAreWritable, loadBooks } from "./load-books";
import { sourcesForConnection } from "./connections";
import { backoffForFailures, consecutiveFailureCount, isConnectionDue } from "./sync-schedule";

export interface SyncRunOutcome {
  connectionId: string;
  status: SyncRunStatus;
  balances: number;
  movements: number;
  accounts: number;
  message: string;
}

interface SyncRead {
  sourceId: string;
  balances: readonly NormalizedBalance[];
  movements: readonly NormalizedSourceTransaction[];
}

/** A connection is eligible for a scheduled run when it is not revoked. */
export function isSyncable(connection: BooksConnection): boolean {
  return connection.status !== "revoked";
}

/**
 * Pull one connection and record the run. `actor` is the display name stored on
 * the audit events; for a scheduled run it is the scheduler.
 */
export async function runConnectionSync(
  books: Books,
  connectionId: string,
  options: { actor: string; trigger: SyncRunTrigger } = { actor: "scheduler", trigger: "manual" },
): Promise<SyncRunOutcome> {
  const connection = books.connections.find((item) => item.id === connectionId);
  if (!connection) throw new Error("That connection is not in this organization.");

  const result = (status: SyncRunStatus, message: string, counts = { balances: 0, movements: 0, accounts: 0 }): SyncRunOutcome => ({
    connectionId,
    status,
    ...counts,
    message,
  });

  const organizationId = books.organization.id;
  const runId = await startSyncRun(organizationId, connection.id, options.trigger);

  if (connection.status === "revoked") {
    const message = "Connection is disconnected.";
    await finishSyncRun(organizationId, runId, { status: "not_live", error: message });
    return result("not_live", message);
  }

  const linked = sourcesForConnection(books.sources, connection);
  if (linked.length === 0) {
    const message = "This connection has no account to read.";
    await finishSyncRun(organizationId, runId, { status: "not_live", error: message });
    return result("not_live", message);
  }

  // A credential is opened here, in server code, and never logged.
  let exchangeCredential: ExchangeCredentialInput | undefined;
  if (venueDefinition(connection.venue) || custodianDefinition(connection.venue)) {
    const stored = await getConnectionCredential(organizationId, connection.id);
    if (!stored) {
      const message = "This connection has no stored key. Re-enter it in Settings.";
      await finishSyncRun(organizationId, runId, { status: "failed", error: message });
      return result("failed", message);
    }
    exchangeCredential = await openStoredCredential(stored);
  }

  try {
    const reads: SyncRead[] = [];
    for (const source of linked) {
      const pulled = await pullReadOnly(connection, source.identifier, connection.cursor ?? "1970-01-01", { exchangeCredential });
      reads.push({ sourceId: source.id, balances: pulled.balances, movements: pulled.movements });
    }
    const counts = {
      balances: reads.reduce((sum, read) => sum + read.balances.length, 0),
      movements: reads.reduce((sum, read) => sum + read.movements.length, 0),
      accounts: reads.length,
    };
    const { skippedAssets } = await recordSyncSuccess(books, connection.id, reads, options.actor);
    const partial = skippedAssets.length > 0;
    await finishSyncRun(organizationId, runId, {
      status: partial ? "partial" : "ok",
      counts,
      payloads: [
        { kind: "balances", data: reads.flatMap((read) => read.balances) },
        { kind: "movements", data: reads.flatMap((read) => read.movements) },
      ],
    });
    return partial
      ? result("partial", `Read. Skipped untracked assets: ${skippedAssets.join(", ")}.`, counts)
      : result("ok", "Balances and movements were read.", counts);
  } catch (error) {
    if (error instanceof ConnectionClosedError) {
      await finishSyncRun(organizationId, runId, { status: "not_live", error: error.message });
      return result("not_live", error.message);
    }
    if (error instanceof AdapterNotImplementedError) {
      await failRun(organizationId, books, connection, runId, statusAfterSyncFailure(connection.status), SYNC_NOT_LIVE, error, options.actor);
      return result("not_live", SYNC_NOT_LIVE);
    }
    const message = syncFailureMessage(error);
    await failRun(organizationId, books, connection, runId, statusAfterSyncFailure(connection.status), message, error, options.actor);
    return result("failed", message);
  }
}

/**
 * A caller-safe failure message. A `BooksWriteError` is ours and is safe to
 * show; anything else (a raw driver or SQL error) is summarised, so a query and
 * its parameters are never surfaced to the user or written to the run history.
 */
export function syncFailureMessage(error: unknown): string {
  if (error instanceof BooksWriteError) return error.message;
  if (error instanceof Error && /unknown asset/i.test(error.message)) return error.message;
  return "The connection could not be read. See the run history for details.";
}

/**
 * Record a failed run: move the connection's status, back the next attempt off
 * by the number of consecutive failures, and keep the run row. A retry cannot be
 * scheduled sooner than the last start plus the backoff.
 */
async function failRun(
  organizationId: string,
  books: Books,
  connection: BooksConnection,
  runId: string,
  status: BooksConnection["status"],
  message: string,
  error: unknown,
  actor: string,
): Promise<void> {
  // History still holds this run as "running"; drop it and count the failures
  // before it, then add one for the run that just failed.
  const history = (await recentRunsForConnection(organizationId, connection.id, 20)).filter((row) => row.status !== "running");
  const failures = consecutiveFailureCount(history) + 1;
  const backoff = backoffForFailures(failures);
  const nextAttemptAt = backoff > 0 ? new Date(Date.now() + backoff) : null;
  await recordSyncFailure(books, connection.id, status, message, actor, nextAttemptAt);
  const runStatus: SyncRunStatus = error instanceof AdapterNotImplementedError ? "not_live" : "failed";
  await finishSyncRun(organizationId, runId, { status: runStatus, error: message });
}

/**
 * Run the eligible connections in an organization. A scheduled run skips a
 * connection that is not due yet (interval or backoff); a manual or CLI run can
 * ask for every connection with `onlyDue: false`.
 */
export async function runAllConnectionSyncs(
  organizationId: string,
  options: { actor: string; trigger: SyncRunTrigger; onlyDue?: boolean } = { actor: "scheduler", trigger: "scheduled" },
): Promise<SyncRunOutcome[]> {
  const books = await loadBooks(organizationId);
  const onlyDue = options.onlyDue ?? options.trigger === "scheduled";
  const now = new Date();
  const connectionIds = books.connections
    .filter(isSyncable)
    .filter((connection) => !onlyDue || isConnectionDue(connection, now))
    .map((connection) => connection.id);
  const outcomes: SyncRunOutcome[] = [];
  for (const connectionId of connectionIds) {
    // Reload per run so each connection's cursor and status reflect prior runs.
    const fresh = await loadBooks(organizationId);
    outcomes.push(await runConnectionSync(fresh, connectionId, options));
  }
  return outcomes;
}

export interface ScheduledRunSummary {
  organizations: number;
  connections: number;
  failures: number;
  skipped: boolean;
}

/**
 * The scheduled pass over every organization with a stored connection. This is
 * what Vercel Cron calls. It honours the interval and backoff (only due
 * connections run), records each run in sync history, and never posts a journal.
 * Without a database it is a no-op, so a demo deploy is quiet.
 */
export async function runDueSyncsForAllOrganizations(): Promise<ScheduledRunSummary> {
  if (!booksAreWritable()) return { organizations: 0, connections: 0, failures: 0, skipped: true };
  const { listOrganizationIds } = await import("@/db/read");
  const organizationIds = await listOrganizationIds();
  let connections = 0;
  let failures = 0;
  for (const organizationId of organizationIds) {
    const outcomes = await runAllConnectionSyncs(organizationId, { actor: "scheduler", trigger: "scheduled" });
    connections += outcomes.length;
    failures += outcomes.filter((outcome) => outcome.status === "failed" || outcome.status === "not_live").length;
  }
  return { organizations: organizationIds.length, connections, failures, skipped: false };
}
