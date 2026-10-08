/**
 * Reads for chain operations health: the execution queue (`chain_transactions`),
 * the job outbox, and the indexer cursors. Scoped to one organization. The
 * projection stores these; this only reads them for the Operations view.
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { chainCursors, chainTransactions, jobOutbox } from "./schema";
import type { ChainTransactionRow, CursorRow, OutboxRow } from "@/data/chain-health";

/** The most recent execution attempts for an organization, newest first. */
export async function recentChainTransactions(organizationId: string, limit = 25): Promise<ChainTransactionRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(chainTransactions)
    .where(eq(chainTransactions.organizationId, organizationId))
    .orderBy(desc(chainTransactions.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    attempt: row.attempt,
    signature: row.signature,
    submittedAt: row.submittedAt,
    finalizedAt: row.finalizedAt,
    error: row.error,
    createdAt: row.createdAt,
  }));
}

/** Outbox jobs for an organization. */
export async function organizationOutbox(organizationId: string): Promise<OutboxRow[]> {
  const db = getDb();
  const rows = await db.select().from(jobOutbox).where(eq(jobOutbox.organizationId, organizationId));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    attempts: row.attempts,
    availableAt: row.availableAt,
    leasedAt: row.leasedAt,
    lastError: row.lastError,
    completedAt: row.completedAt,
  }));
}

/** Indexer cursors. Not organization-scoped: the indexer tracks the cluster. */
export async function chainCursorRows(): Promise<CursorRow[]> {
  const db = getDb();
  const rows = await db.select().from(chainCursors);
  return rows.map((row) => ({
    cluster: row.cluster,
    programId: row.programId,
    cursor: row.cursor,
    updatedAt: row.updatedAt,
  }));
}
