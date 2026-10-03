/**
 * Settlement booking: from a finalized settlement, create a reviewable journal
 * draft and link it to the settlement. This runs a draft, not a posting — the
 * accountant approves it through the existing workflow, which inserts the
 * immutable entry. A worker must never call `postJournalEntry`.
 *
 * Idempotent: the link is unique by (settlement, purpose), so a retry finds the
 * existing draft rather than creating a second journal for the same payment.
 */
import { createDraft } from "@/db/drafts";
import { linkSettlementToDraft, settlementLink } from "@/db/settlements";
import { proposeSettlementJournal, settlementReference, type SettlementForAccounting } from "./settlement";

export interface BookSettlementInput {
  organizationId: string;
  entityId: string;
  settlementId: string;
  settlement: SettlementForAccounting;
  /** Who the draft is attributed to. A worker booking is attributed to the system. */
  preparedBy: string;
  /** The purpose, for the per-purpose uniqueness. Defaults to the supplier payment. */
  purpose?: string;
}

export interface BookSettlementResult {
  draftId: string;
  linkId: string;
  treatment: "clears_payable" | "recognizes_expense";
  /** True when a draft already existed and none was created. */
  existing: boolean;
}

/**
 * Book a finalized settlement: propose, create a draft, and link it. The draft
 * is balanced by proposal construction, so it saves; approval is a separate,
 * human step.
 */
export async function bookSettlement(input: BookSettlementInput): Promise<BookSettlementResult> {
  const purpose = input.purpose ?? "supplier_payment";
  const proposal = proposeSettlementJournal(input.settlement);

  // A retry finds the existing link and returns it, so one settlement yields one
  // journal per purpose even if the worker runs twice.
  const existing = await settlementLink(input.settlementId, purpose);
  if (existing?.journalDraftId) {
    return { draftId: existing.journalDraftId, linkId: existing.id, treatment: proposal.treatment, existing: true };
  }

  const reference = input.settlement.reference || settlementReference(input.settlementId, purpose);
  const draftId = await createDraft(input.organizationId, {
    entityId: input.entityId,
    reference,
    entryDate: input.settlement.entryDate,
    memo: input.settlement.memo,
    currency: input.settlement.currency,
    preparedBy: input.preparedBy,
    actor: input.preparedBy,
    lines: proposal.lines.map((line) => ({
      accountCode: line.accountCode,
      side: line.side,
      amountMinor: line.amountMinor,
      currency: line.currency,
      memo: line.memo,
    })),
  });

  const linkId = await linkSettlementToDraft({
    organizationId: input.organizationId,
    entityId: input.entityId,
    settlementId: input.settlementId,
    purpose,
    journalDraftId: draftId,
  });

  return { draftId, linkId, treatment: proposal.treatment, existing: false };
}
