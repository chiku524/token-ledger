/**
 * Persist manual reconciliation decisions. An override survives a reload and is
 * overlaid on the automatic match by the builder, so an accountant can clear an
 * exception or undo a match without editing derived data.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, organizations, reconciliationOverrides } from "./schema";

export class ReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconciliationError";
  }
}

export interface MatchInput {
  organizationId: string;
  entityId: string;
  sourceTransactionId: string;
  journalEntryId: string;
  journalLineNumber: number;
  note: string;
  actor: string;
}

/** Pair a source transaction with a journal line. Replaces any prior decision for it. */
export async function matchReconciliation(input: MatchInput): Promise<void> {
  if (!input.note.trim()) throw new ReconciliationError("Add a note explaining the match.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(reconciliationOverrides).where(eq(reconciliationOverrides.sourceTransactionId, input.sourceTransactionId));
    await tx.insert(reconciliationOverrides).values({
      id: `rcon_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      entityId: input.entityId,
      sourceTransactionId: input.sourceTransactionId,
      journalEntryId: input.journalEntryId,
      journalLineNumber: input.journalLineNumber,
      kind: "match",
      note: input.note.trim(),
      actor: input.actor,
    });
    await tx.insert(auditEvents).values({
      id: `audit_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor: input.actor,
      action: "reconciliation.matched",
      subjectType: "source_transaction",
      subjectId: input.sourceTransactionId,
      detail: `Matched to journal entry ${input.journalEntryId} line ${input.journalLineNumber}.`,
    });
  });
}

/** Reject an automatic match, forcing the pair to an exception. */
export async function unmatchReconciliation(input: {
  organizationId: string;
  entityId: string;
  sourceTransactionId: string;
  note: string;
  actor: string;
}): Promise<void> {
  if (!input.note.trim()) throw new ReconciliationError("Add a note explaining the unmatch.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(reconciliationOverrides).where(eq(reconciliationOverrides.sourceTransactionId, input.sourceTransactionId));
    await tx.insert(reconciliationOverrides).values({
      id: `rcon_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      entityId: input.entityId,
      sourceTransactionId: input.sourceTransactionId,
      journalEntryId: null,
      journalLineNumber: null,
      kind: "unmatch",
      note: input.note.trim(),
      actor: input.actor,
    });
    await tx.insert(auditEvents).values({
      id: `audit_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor: input.actor,
      action: "reconciliation.unmatched",
      subjectType: "source_transaction",
      subjectId: input.sourceTransactionId,
      detail: "Automatic match rejected; left as an exception.",
    });
  });
}

/** Clear any manual decision, returning the row to the automatic result. */
export async function clearReconciliationOverride(organizationId: string, sourceTransactionId: string): Promise<void> {
  const db = getDb();
  await db.delete(reconciliationOverrides).where(eq(reconciliationOverrides.sourceTransactionId, sourceTransactionId));
}

/** Guard referenced ids belong to the organization, so a cross-org id cannot be used. */
export async function assertOrganizationExists(organizationId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (rows.length === 0) throw new ReconciliationError("That organization does not exist.");
}
