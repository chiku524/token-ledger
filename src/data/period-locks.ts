/**
 * Period close. A locked range per entity refuses changes dated inside it. This
 * is a guard: it does not move data. Kept pure so the rule is tested without a
 * database.
 */
export interface PeriodLock {
  id: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  note: string;
}

/** The lock covering a date, or null when the date is open. */
export function lockCovering(locks: readonly PeriodLock[], entityId: string, date: string): PeriodLock | null {
  return (
    locks.find((lock) => lock.entityId === entityId && lock.periodStart <= date && date <= lock.periodEnd) ?? null
  );
}

export function isLocked(locks: readonly PeriodLock[], entityId: string, date: string): boolean {
  return lockCovering(locks, entityId, date) !== null;
}

/** The message to show when a change falls in a closed period. */
export function lockedMessage(lock: PeriodLock, date: string): string {
  return `${date} is inside a closed period (${lock.periodStart} to ${lock.periodEnd}). Reopen it first.`;
}
