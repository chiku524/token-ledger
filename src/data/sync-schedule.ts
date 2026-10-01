/**
 * When a connection is due for a scheduled pull, and how long to wait after a
 * failure. Kept pure so the interval and backoff can be tested without a
 * database or a clock. The scheduler and the CLI both read the policy from here.
 */
import type { SyncRunStatus } from "@/db/sync-runs";

/** How often a healthy connection is pulled. Vercel Cron runs at this interval too. */
export const DEFAULT_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Extra wait after consecutive failures, indexed by failure count. A run that
 * keeps failing is retried less often, so a rate-limited venue is not hammered.
 * The last step is the ceiling.
 */
export const SYNC_BACKOFF_MS = [0, 5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];

/** A failed run for scheduling purposes: it did not complete a read. */
export function isFailedRun(status: SyncRunStatus): boolean {
  return status === "failed" || status === "not_live";
}

/** Extra backoff for a run that has failed this many times in a row. */
export function backoffForFailures(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return SYNC_BACKOFF_MS[Math.min(consecutiveFailures, SYNC_BACKOFF_MS.length - 1)];
}

/** When the next run is due. Null means "never run", which is due immediately. */
export function nextDueAt(
  lastStartedAt: Date | null,
  consecutiveFailures: number,
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): Date | null {
  if (!lastStartedAt) return null;
  return new Date(lastStartedAt.getTime() + intervalMs + backoffForFailures(consecutiveFailures));
}

export function isDue(
  lastStartedAt: Date | null,
  consecutiveFailures: number,
  now: Date = new Date(),
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): boolean {
  const due = nextDueAt(lastStartedAt, consecutiveFailures, intervalMs);
  return due === null || due.getTime() <= now.getTime();
}

/**
 * Whether a connection should be pulled now. A backed-off connection (a stored
 * `nextAttemptAt`) is due once that time passes; otherwise the last success plus
 * the interval decides. A never-pulled connection is always due.
 */
export function isConnectionDue(
  connection: { lastSyncedAt: string | null; nextAttemptAt: string | null },
  now: Date = new Date(),
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): boolean {
  if (connection.nextAttemptAt) {
    const at = Date.parse(connection.nextAttemptAt);
    return Number.isNaN(at) || at <= now.getTime();
  }
  if (!connection.lastSyncedAt) return true;
  const last = Date.parse(connection.lastSyncedAt);
  return Number.isNaN(last) || last + intervalMs <= now.getTime();
}

/**
 * The number of failed runs at the head of a newest-first history. Stops at the
 * first success, so a single old failure does not keep a healthy connection
 * backed off.
 */
export function consecutiveFailureCount(runsNewestFirst: readonly { status: SyncRunStatus }[]): number {
  let count = 0;
  for (const run of runsNewestFirst) {
    if (!isFailedRun(run.status)) break;
    count += 1;
  }
  return count;
}
