/**
 * Backfill planning. The indexer must recover from a restart or missed logs:
 * it keeps a durable cursor (last observed slot per cluster and program) and,
 * on each pass, works forward from it. A provisional fork (a slot that did not
 * finalize on the canonical chain) is only trusted once it is finalized, so the
 * cursor advances only to a finalized slot.
 *
 * Pure: the plan is computed from a cursor and the current finalized height.
 */
export interface IndexerCursor {
  cluster: string;
  programId: string;
  /** The last finalized slot already processed. */
  lastSlot: bigint;
}

export interface BackfillPlan {
  /** The slot to start scanning from (exclusive). */
  fromSlot: bigint;
  /** The last finalized slot to scan to (inclusive). */
  toSlot: bigint;
  /** How many slots this pass covers. */
  spanSlots: bigint;
  /** Whether there is work to do. */
  hasWork: boolean;
}

export interface BackfillOptions {
  /** The current finalized slot height, from the RPC. */
  finalizedSlot: bigint;
  /** Maximum slots to scan in one pass, to bound the work. */
  maxSpanSlots?: bigint;
}

/**
 * Plan the next backfill pass. Never scans past the finalized height, so a
 * provisional fork cannot be indexed. If the cursor is ahead of finality (a
 * reorg), this reports no work: the scan stays put until the canonical chain
 * finalizes a height at or beyond the cursor, so the ahead slots are revisited
 * rather than trusted. A caller that wants to rewind explicitly lowers the
 * cursor; this never moves it backwards.
 */
export function planBackfill(cursor: IndexerCursor, options: BackfillOptions): BackfillPlan {
  const fromSlot = cursor.lastSlot;
  const capped = fromSlot + (options.maxSpanSlots ?? 1_000n);
  const toSlot = capped < options.finalizedSlot ? capped : options.finalizedSlot;
  const spanSlots = toSlot > fromSlot ? toSlot - fromSlot : 0n;
  return { fromSlot, toSlot, spanSlots, hasWork: spanSlots > 0n };
}

/** The cursor after a successful pass. */
export function advanceCursor(cursor: IndexerCursor, plan: BackfillPlan): IndexerCursor {
  if (!plan.hasWork) return cursor;
  return { ...cursor, lastSlot: plan.toSlot };
}

/**
 * Whether a signature seen at `atSlot` is safe to project: only at or below the
 * finalized height. A notification above finality is provisional and must wait.
 */
export function isFinalized(atSlot: bigint, finalizedSlot: bigint): boolean {
  return atSlot <= finalizedSlot;
}

/**
 * Deduplicate notifications: the same (cluster, signature, ordinal) seen twice
 * is one event. Returns the new ones only, preserving order.
 */
export function dedupeNotifications<T extends { cluster: string; signature: string; ordinal: number }>(
  seen: ReadonlySet<string>,
  incoming: readonly T[],
): { fresh: T[]; keys: string[] } {
  const fresh: T[] = [];
  const keys: string[] = [];
  for (const item of incoming) {
    const key = `${item.cluster}:${item.signature}:${item.ordinal}`;
    if (seen.has(key)) continue;
    seen = new Set(seen).add(key);
    fresh.push(item);
    keys.push(key);
  }
  return { fresh, keys };
}
