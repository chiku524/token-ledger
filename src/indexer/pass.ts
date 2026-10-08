/**
 * The indexer pass: advance from the durable cursor to the finalized height,
 * decode program events, and record the ones not already seen. It is the missing
 * link between the chain and the app's projections (plan §7–§8).
 *
 * The pass is pure orchestration over injected interfaces — a `ChainSource` (a
 * real RPC adapter, or a script in a test) and an `IndexerStore` (the database
 * writes). It never trusts a slot above finality, and it never projects an event
 * it has already recorded, so a redelivery or a restart is a no-op.
 */
import { advanceCursor, dedupeNotifications, planBackfill, type IndexerCursor } from "./backfill";
import { decodeEventsFromLogs, type DecodedEvent } from "./events";

/** One finalized transaction the pass can decode. */
export interface FinalizedTransaction {
  signature: string;
  slot: bigint;
  blockTime: Date | null;
  logs: readonly string[];
  /** The program the pass is indexing; events from other programs are ignored. */
  programId: string;
}

/** Where finalized chain data comes from. A real adapter talks to an RPC. */
export interface ChainSource {
  /** The current finalized slot height. */
  finalizedSlot(): Promise<bigint>;
  /** Finalized transactions for a program in (fromSlot, toSlot]. */
  transactionsInRange(programId: string, fromSlot: bigint, toSlot: bigint): Promise<FinalizedTransaction[]>;
}

/** A recorded event, ready to persist. */
export interface RecordedEvent {
  cluster: string;
  signature: string;
  instructionIndex: number;
  eventOrdinal: number;
  programId: string;
  name: string;
  payload: Record<string, unknown>;
  slot: bigint;
  blockTime: Date | null;
  /** The key used to dedupe: cluster:signature:ordinal. */
  key: string;
}

/** Durable state the pass reads and advances. The database implements this. */
export interface IndexerStore {
  readCursor(cluster: string, programId: string): Promise<IndexerCursor>;
  writeCursor(cluster: string, programId: string, lastSlot: bigint): Promise<void>;
  /** Record an event idempotently. Returns true when it was newly inserted. */
  recordEvent(event: RecordedEvent): Promise<boolean>;
}

export interface IndexerPassOptions {
  cluster: string;
  programId: string;
  /** Bound the work per pass; the plan targets bounded backfill. */
  maxSpanSlots?: bigint;
  /** A clock, injected for tests. */
  now?: () => Date;
}

export interface IndexerPassSummary {
  fromSlot: bigint;
  toSlot: bigint;
  scanned: number;
  decoded: number;
  inserted: number;
  hasWork: boolean;
}

/**
 * Run one pass. Steps:
 * 1. read the cursor; 2. plan a bounded backfill to finality; 3. pull finalized
 * transactions; 4. decode events; 5. dedupe within the batch; 6. record each
 * idempotently; 7. advance the cursor to the last finalized slot scanned.
 *
 * The cursor advances only to a finalized slot, so a provisional fork is never
 * indexed and a reorg stalls rather than corrupting state.
 */
export async function runIndexerPass(
  deps: { source: ChainSource; store: IndexerStore },
  options: IndexerPassOptions,
): Promise<IndexerPassSummary> {
  const { source, store } = deps;
  const cursor = await store.readCursor(options.cluster, options.programId);
  const finalizedSlot = await source.finalizedSlot();
  const plan = planBackfill(cursor, { finalizedSlot, maxSpanSlots: options.maxSpanSlots });
  if (!plan.hasWork) {
    return { fromSlot: plan.fromSlot, toSlot: plan.toSlot, scanned: 0, decoded: 0, inserted: 0, hasWork: false };
  }

  const transactions = await source.transactionsInRange(options.programId, plan.fromSlot, plan.toSlot);

  // Flatten to per-instruction event candidates, then decode each transaction's
  // logs. Dedupe by cluster+signature+ordinal so the same event twice is once.
  const seen = new Set<string>();
  const candidates: Array<{ signature: string; slot: bigint; blockTime: Date | null; event: DecodedEvent }> = [];
  for (const transaction of transactions) {
    for (const event of decodeEventsFromLogs(transaction.logs)) {
      candidates.push({
        signature: transaction.signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        event,
      });
    }
  }

  const { fresh } = dedupeNotifications(
    seen,
    candidates.map((candidate) => ({
      cluster: options.cluster,
      signature: candidate.signature,
      ordinal: candidate.event.ordinal,
    })),
  );
  const freshKeys = new Set(fresh.map((entry) => `${entry.cluster}:${entry.signature}:${entry.ordinal}`));

  let inserted = 0;
  for (const candidate of candidates) {
    const key = `${options.cluster}:${candidate.signature}:${candidate.event.ordinal}`;
    if (!freshKeys.has(key)) continue;
    const isNew = await store.recordEvent({
      cluster: options.cluster,
      signature: candidate.signature,
      instructionIndex: 0,
      eventOrdinal: candidate.event.ordinal,
      programId: options.programId,
      name: candidate.event.name,
      payload: candidate.event.fields,
      slot: candidate.slot,
      blockTime: candidate.blockTime,
      key,
    });
    if (isNew) inserted += 1;
  }

  await store.writeCursor(options.cluster, options.programId, advanceCursor(cursor, plan).lastSlot);

  return {
    fromSlot: plan.fromSlot,
    toSlot: plan.toSlot,
    scanned: transactions.length,
    decoded: candidates.length,
    inserted,
    hasWork: true,
  };
}
