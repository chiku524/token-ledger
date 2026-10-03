/**
 * Durable outbox decisions, kept pure so they are testable without a database
 * or a clock. The worker (see `runner.ts`) reads these decisions; the queue
 * (`src/db/outbox.ts`) persists the rows.
 *
 * The plan requires: stable logical operation ids, attempt recording, bounded
 * RPC retries, blockhash-expiry handling, and atomic downstream insertion. These
 * helpers cover the retry/backoff/lease/attempt parts; the DB layer covers the
 * atomic insert.
 */

export const DEFAULT_LEASE_MS = 60_000;
export const DEFAULT_MAX_ATTEMPTS = 6;
export const BASE_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Exponential backoff with a cap and a small deterministic jitter derived from
 * the attempt, so a fleet of workers does not retry in lockstep. `attempt` is
 * 1-based (the first retry is attempt 1).
 */
export function backoffFor(attempt: number, options: { baseMs?: number; maxMs?: number } = {}): number {
  const base = options.baseMs ?? BASE_BACKOFF_MS;
  const max = options.maxMs ?? MAX_BACKOFF_MS;
  if (attempt <= 0) return base;
  const exponential = Math.min(base * 2 ** (attempt - 1), max);
  // Jitter up to 20% of the exponential delay, stable per attempt.
  const jitter = Math.floor((exponential * (attempt % 5)) / 25);
  return Math.min(exponential + jitter, max);
}

/** When a leased job becomes available again after a retryable failure. */
export function nextAttemptAt(now: Date, attempt: number, options?: { baseMs?: number; maxMs?: number }): Date {
  return new Date(now.getTime() + backoffFor(attempt, options));
}

/** A lease held past its TTL is reclaimable, so a crashed worker cannot strand a job. */
export function isLeaseExpired(leasedAt: Date | null, now: Date, leaseMs: number = DEFAULT_LEASE_MS): boolean {
  if (!leasedAt) return true;
  return now.getTime() - leasedAt.getTime() >= leaseMs;
}

/** A stable dedupe key so enqueuing the same work twice is a no-op. */
export function outboxDedupeKey(kind: string, subjectId: string, discriminator = ""): string {
  return discriminator ? `${kind}:${subjectId}:${discriminator}` : `${kind}:${subjectId}`;
}

export type AttemptOutcome = "retry" | "dead" | "done";

export interface AttemptState {
  /** Attempts already made, including the one that just failed. */
  attempts: number;
  maxAttempts?: number;
  /** The error was a transient RPC/transport problem worth retrying. */
  retryable: boolean;
  /** The transaction's blockhash expired; the worker must re-check state first. */
  blockhashExpired?: boolean;
}

/**
 * Decide what to do after an attempt. A non-retryable error is dead at once
 * (a program revert will not succeed on retry). Blockhash expiry is retryable
 * but flagged so the caller re-queries signature and PDA state before rebuilding.
 * Otherwise retry until `maxAttempts`.
 */
export function decideAttempt(state: AttemptState): { outcome: AttemptOutcome; needsStateCheck: boolean } {
  if (!state.retryable) return { outcome: "dead", needsStateCheck: false };
  const max = state.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (state.attempts >= max) return { outcome: "dead", needsStateCheck: false };
  return { outcome: "retry", needsStateCheck: state.blockhashExpired === true };
}
