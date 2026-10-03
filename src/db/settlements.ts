/**
 * Persistence for the settlement → journal link. One settlement may produce a
 * journal for each purpose (a supplier expense, a payable clearing, a fee), so
 * uniqueness is by (settlement, purpose), not by settlement. The link is what
 * makes export idempotent: an export failure retries the export, never the
 * payment. See docs/adr-accounting-sync.md.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, settlementJournalLinks } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export interface CreateLinkInput {
  organizationId: string;
  entityId: string;
  settlementId: string;
  purpose: string;
  journalDraftId: string | null;
}

/**
 * Create the link for a settlement and purpose, idempotent by (settlement,
 * purpose). Returns the existing link's id when one exists, so re-running the
 * proposal for the same settlement does not create a second journal.
 */
export async function linkSettlementToDraft(input: CreateLinkInput): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: settlementJournalLinks.id })
      .from(settlementJournalLinks)
      .where(
        and(
          eq(settlementJournalLinks.settlementId, input.settlementId),
          eq(settlementJournalLinks.purpose, input.purpose),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const id = newId("link");
    await tx.insert(settlementJournalLinks).values({
      id,
      organizationId: input.organizationId,
      entityId: input.entityId,
      settlementId: input.settlementId,
      journalDraftId: input.journalDraftId,
      purpose: input.purpose,
      status: "draft",
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor: "worker",
      action: "settlement.journal_linked",
      subjectType: "settlement_journal_link",
      subjectId: id,
      detail: input.purpose,
    });
    return id;
  });
}

/** Record the immutable entry once the draft is posted, so export can proceed. */
export async function markLinkPosted(linkId: string, journalEntryId: string): Promise<void> {
  const db = getDb();
  await db
    .update(settlementJournalLinks)
    .set({ journalEntryId, status: "posted" })
    .where(eq(settlementJournalLinks.id, linkId));
}

/** The link for a settlement and purpose, if one exists. */
export async function settlementLink(settlementId: string, purpose: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(settlementJournalLinks)
    .where(and(eq(settlementJournalLinks.settlementId, settlementId), eq(settlementJournalLinks.purpose, purpose)))
    .limit(1);
  return row ?? null;
}
