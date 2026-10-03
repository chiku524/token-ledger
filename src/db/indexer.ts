/**
 * Persistence for the finalized indexer: the cursor, decoded chain events, and
 * finalized settlements. Events are uniquely keyed by cluster, signature and
 * ordinal, so a redelivered notification is a no-op. A settlement is inserted
 * once per (cluster, treasury, invoice key) and only after finality.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { chainCursors, chainEvents, paymentSettlements } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** The stored cursor for a cluster and program, or a genesis cursor. */
export async function readCursor(cluster: string, programId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(chainCursors)
    .where(and(eq(chainCursors.cluster, cluster), eq(chainCursors.programId, programId)))
    .limit(1);
  return row ? { cluster: row.cluster, programId: row.programId, lastSlot: BigInt(row.cursor) } : { cluster, programId, lastSlot: 0n };
}

/** Advance the cursor after a finalized pass. Monotonic: never moves backwards. */
export async function writeCursor(cluster: string, programId: string, lastSlot: bigint): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: chainCursors.id, cursor: chainCursors.cursor })
    .from(chainCursors)
    .where(and(eq(chainCursors.cluster, cluster), eq(chainCursors.programId, programId)))
    .limit(1);
  if (!row) {
    await db.insert(chainCursors).values({ id: newId("cur"), cluster, programId, cursor: lastSlot.toString() });
    return;
  }
  if (lastSlot <= BigInt(row.cursor)) return;
  await db.update(chainCursors).set({ cursor: lastSlot.toString(), updatedAt: new Date() }).where(eq(chainCursors.id, row.id));
}

export interface ChainEventInput {
  organizationId: string | null;
  cluster: string;
  signature: string;
  instructionIndex: number;
  eventOrdinal: number;
  programId: string;
  name: string;
  payload: Record<string, unknown>;
  slot: bigint;
  blockTime: Date | null;
}

/** Record a decoded event, idempotent by its unique identity. Returns true if new. */
export async function recordChainEvent(input: ChainEventInput): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(chainEvents)
    .values({ id: newId("evt"), ...input })
    .onConflictDoNothing()
    .returning({ id: chainEvents.id });
  return inserted.length > 0;
}

export interface SettlementInput {
  organizationId: string;
  entityId: string;
  treasuryAccountId: string;
  invoiceId: string;
  paymentProposalId: string;
  cluster: string;
  invoiceKey: string;
  recipientOwner: string;
  amountMinor: bigint;
  signature: string;
  slot: bigint;
  finalizedAt: Date;
}

/** Insert a finalized settlement, idempotent by its unique keys. Returns true if new. */
export async function recordSettlement(input: SettlementInput): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(paymentSettlements)
    .values({ id: newId("settle"), ...input })
    .onConflictDoNothing()
    .returning({ id: paymentSettlements.id });
  return inserted.length > 0;
}
