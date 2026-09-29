export const LOCKOUT_LIMIT = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Milliseconds until the oldest recent failure ages out. Zero means sign-in may proceed. */
export function lockoutRemaining(failedAt: readonly Date[], now: Date): number {
  const recent = failedAt
    .map((attempt) => attempt.getTime())
    .filter((time) => now.getTime() - time < LOCKOUT_WINDOW_MS && now.getTime() - time >= 0)
    .sort((a, b) => a - b);
  if (recent.length < LOCKOUT_LIMIT) return 0;
  const oldest = recent[recent.length - LOCKOUT_LIMIT];
  if (oldest === undefined) return 0;
  return Math.max(0, LOCKOUT_WINDOW_MS - (now.getTime() - oldest));
}
