/**
 * The durable job outbox. Enqueuing work is atomic with the write that creates
 * it (the caller passes its transaction), and each job carries a stable dedupe
 * key so the same work enqueued twice is a no-op. Claiming uses a lease so two
 * workers cannot run the same job, and a lease that outlives its TTL is
 * reclaimable, so a crashed worker cannot strand a job.
 */
import { and, asc, eq, inArray, lte, or, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { jobOutbox } from "./schema";
import { DEFAULT_LEASE_MS, isLeaseExpired, nextAttemptAt, outboxDedupeKey, type AttemptOutcome } from "@/jobs/outbox";

export interface EnqueueInput {
  organizationId: string | null;
  kind: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  /** Extra discriminator when one subject can have several jobs of a kind. */
  discriminator?: string;
}

/**
 * Enqueue a job, or return null when one with the same dedupe key already
 * exists. Safe to call inside a transaction so the job and the business write
 * commit together.
 */
export async function enqueueJob(input: EnqueueInput): Promise<string | null> {
  const db = getDb();
  const dedupeKey = outboxDedupeKey(input.kind, input.subjectId ?? "", input.discriminator ?? "");
  const id = `job_${crypto.randomUUID()}`;
  const inserted = await db
    .insert(jobOutbox)
    .values({
      id,
      organizationId: input.organizationId,
      kind: input.kind,
      subjectId: input.subjectId,
      payload: input.payload,
      dedupeKey,
      status: "queued",
      attempts: 0,
      availableAt: new Date(),
    })
    .onConflictDoNothing({ target: jobOutbox.dedupeKey })
    .returning({ id: jobOutbox.id });
  return inserted[0]?.id ?? null;
}

export interface JobRow {
  id: string;
  organizationId: string | null;
  kind: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
  attempts: number;
  availableAt: Date;
  leasedAt: Date | null;
}

/**
 * Claim up to `limit` due jobs for `owner`, leasing them. Reclaims expired
 * leases so a dead worker's jobs are retried. Returns the claimed rows.
 */
export async function claimJobs(owner: string, limit = 5, now: Date = new Date(), leaseMs = DEFAULT_LEASE_MS): Promise<JobRow[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const leaseCutoff = new Date(now.getTime() - leaseMs);
    const candidates = await tx
      .select()
      .from(jobOutbox)
      .where(
        and(
          inArray(jobOutbox.status, ["queued", "leased"]),
          lte(jobOutbox.availableAt, now),
          or(isNull(jobOutbox.leasedAt), lte(jobOutbox.leasedAt, leaseCutoff)),
        ),
      )
      .orderBy(asc(jobOutbox.availableAt))
      .limit(limit);
    const claimed: JobRow[] = [];
    for (const row of candidates) {
      const updated = await tx
        .update(jobOutbox)
        .set({ status: "leased", leasedAt: now, leaseOwner: owner })
        .where(and(eq(jobOutbox.id, row.id), or(isNull(jobOutbox.leasedAt), lte(jobOutbox.leasedAt, leaseCutoff))))
        .returning({ id: jobOutbox.id });
      if (updated.length > 0) {
        claimed.push({
          id: row.id,
          organizationId: row.organizationId,
          kind: row.kind,
          subjectId: row.subjectId,
          payload: row.payload as Record<string, unknown>,
          dedupeKey: row.dedupeKey,
          attempts: row.attempts,
          availableAt: row.availableAt,
          leasedAt: now,
        });
      }
    }
    return claimed;
  });
}

/** Mark a job done. */
export async function completeJob(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(jobOutbox)
    .set({ status: "done", completedAt: new Date(), leasedAt: null, leaseOwner: null })
    .where(eq(jobOutbox.id, id));
}

/** Record a failed attempt and reschedule, or mark it dead. */
export async function failJob(
  id: string,
  outcome: Exclude<AttemptOutcome, "done">,
  error: string,
  now: Date = new Date(),
): Promise<void> {
  const db = getDb();
  const [row] = await db.select({ attempts: jobOutbox.attempts }).from(jobOutbox).where(eq(jobOutbox.id, id)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  if (outcome === "dead") {
    await db
      .update(jobOutbox)
      .set({ status: "failed", attempts, lastError: error, leasedAt: null, leaseOwner: null })
      .where(eq(jobOutbox.id, id));
    return;
  }
  await db
    .update(jobOutbox)
    .set({ status: "queued", attempts, lastError: error, availableAt: nextAttemptAt(now, attempts), leasedAt: null, leaseOwner: null })
    .where(eq(jobOutbox.id, id));
}

export { isLeaseExpired };
