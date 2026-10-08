/**
 * Chain operations health: the execution queue, the outbox, and indexer lag.
 *
 * Pure and deterministic (it takes `now`), so the Operations page and its tests
 * read the same rules. It reports states — awaiting submission, awaiting finality,
 * finalized, failed, indexer lag — never a settled/success claim: only a
 * `finalizedAt` slot is settled, exactly as the execution boundary insists.
 */

export interface ChainTransactionRow {
  id: string;
  kind: string;
  attempt: number;
  signature: string | null;
  submittedAt: Date | null;
  finalizedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export interface OutboxRow {
  id: string;
  kind: string;
  attempts: number;
  availableAt: Date;
  leasedAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
}

export interface CursorRow {
  cluster: string;
  programId: string;
  cursor: string;
  updatedAt: Date;
}

export interface ChainHealth {
  execution: {
    awaitingSubmission: number;
    awaitingFinality: number;
    finalized: number;
    failed: number;
    /** Age of the oldest still-pending execution, in seconds. */
    oldestPendingSeconds: number | null;
    rows: ChainTransactionRow[];
  };
  outbox: {
    pending: number;
    leased: number;
    failed: number;
    completed: number;
  };
  indexer: {
    cursorCount: number;
    /** Seconds since the least-recently-updated cursor advanced. */
    worstLagSeconds: number | null;
    stale: boolean;
    rows: { cluster: string; programId: string; cursor: string; lagSeconds: number }[];
  };
}

/** A cursor older than this is "stale": the indexer has not advanced it. */
export const INDEXER_STALE_SECONDS = 15 * 60;

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

export function deriveChainHealth(
  input: { transactions: readonly ChainTransactionRow[]; outbox: readonly OutboxRow[]; cursors: readonly CursorRow[] },
  now: Date,
): ChainHealth {
  let awaitingSubmission = 0;
  let awaitingFinality = 0;
  let finalized = 0;
  let failed = 0;
  let oldestPending: number | null = null;

  for (const row of input.transactions) {
    if (row.finalizedAt) {
      finalized += 1;
      continue;
    }
    if (row.error) {
      failed += 1;
      continue;
    }
    if (row.signature) {
      awaitingFinality += 1;
      const age = secondsBetween(row.submittedAt ?? row.createdAt, now);
      oldestPending = oldestPending === null ? age : Math.max(oldestPending, age);
    } else {
      awaitingSubmission += 1;
      const age = secondsBetween(row.createdAt, now);
      oldestPending = oldestPending === null ? age : Math.max(oldestPending, age);
    }
  }

  let pending = 0;
  let leased = 0;
  let outboxFailed = 0;
  let completed = 0;
  for (const job of input.outbox) {
    if (job.completedAt) {
      completed += 1;
    } else if (job.leasedAt) {
      leased += 1;
    } else if (job.lastError && job.attempts > 0) {
      outboxFailed += 1;
    } else if (job.availableAt.getTime() <= now.getTime()) {
      pending += 1;
    } else {
      // Scheduled for the future; not yet due.
      pending += 1;
    }
  }

  const indexerRows = input.cursors
    .map((cursor) => ({
      cluster: cursor.cluster,
      programId: cursor.programId,
      cursor: cursor.cursor,
      lagSeconds: secondsBetween(cursor.updatedAt, now),
    }))
    .sort((a, b) => b.lagSeconds - a.lagSeconds);
  const worstLagSeconds = indexerRows.length > 0 ? indexerRows[0]!.lagSeconds : null;

  return {
    execution: { awaitingSubmission, awaitingFinality, finalized, failed, oldestPendingSeconds: oldestPending, rows: input.transactions.slice() },
    outbox: { pending, leased, failed: outboxFailed, completed },
    indexer: {
      cursorCount: indexerRows.length,
      worstLagSeconds,
      stale: worstLagSeconds !== null && worstLagSeconds > INDEXER_STALE_SECONDS,
      rows: indexerRows,
    },
  };
}
