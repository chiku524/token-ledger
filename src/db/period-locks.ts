/**
 * Persist period locks and enforce the close. Reading the locks is a small query
 * used by every write that must respect a closed period.
 */
import { eq } from "drizzle-orm";
import { isLocked, lockedMessage, lockCovering, type PeriodLock } from "@/data/period-locks";
import { getDb } from "./client";
import { auditEvents, periodLocks } from "./schema";

export class PeriodLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodLockedError";
  }
}

export async function listPeriodLocks(organizationId: string): Promise<PeriodLock[]> {
  const db = getDb();
  const rows = await db.select().from(periodLocks).where(eq(periodLocks.organizationId, organizationId));
  return rows.map((row) => ({
    id: row.id,
    entityId: row.entityId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    note: row.note,
  }));
}

/** Refuse a change dated inside a closed period. */
export async function assertPeriodOpen(organizationId: string, entityId: string, date: string): Promise<void> {
  const locks = await listPeriodLocks(organizationId);
  const lock = lockCovering(locks, entityId, date);
  if (lock) throw new PeriodLockedError(lockedMessage(lock, date));
}

/** Close a range for an entity. Overlapping an existing lock is refused. */
export async function closePeriod(input: {
  organizationId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  note: string;
  actor: string;
}): Promise<void> {
  if (input.periodStart > input.periodEnd) throw new PeriodLockedError("The start date must be on or before the end date.");
  if (!input.note.trim()) throw new PeriodLockedError("Add a note explaining the close.");
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(periodLocks).where(eq(periodLocks.organizationId, input.organizationId));
    const overlaps = existing.some(
      (lock) =>
        lock.entityId === input.entityId && input.periodStart <= lock.periodEnd && lock.periodStart <= input.periodEnd,
    );
    if (overlaps) throw new PeriodLockedError("That range overlaps a period that is already closed.");
    await tx.insert(periodLocks).values({
      id: `lock_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      entityId: input.entityId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      note: input.note.trim(),
      actor: input.actor,
    });
    await tx.insert(auditEvents).values({
      id: `audit_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor: input.actor,
      action: "period.closed",
      subjectType: "entity",
      subjectId: input.entityId,
      detail: `Closed ${input.periodStart} to ${input.periodEnd}.`,
    });
  });
}

/** Reopen a closed period by id (owner/admin only; enforced by the caller). */
export async function reopenPeriod(organizationId: string, lockId: string, actor: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const lock = (await tx.select().from(periodLocks).where(eq(periodLocks.id, lockId)).limit(1))[0];
    if (!lock || lock.organizationId !== organizationId) throw new PeriodLockedError("That closed period does not exist.");
    await tx.delete(periodLocks).where(eq(periodLocks.id, lockId));
    await tx.insert(auditEvents).values({
      id: `audit_${crypto.randomUUID()}`,
      organizationId,
      occurredAt: new Date(),
      actor,
      action: "period.reopened",
      subjectType: "entity",
      subjectId: lock.entityId,
      detail: `Reopened ${lock.periodStart} to ${lock.periodEnd}.`,
    });
  });
}

export { isLocked };
