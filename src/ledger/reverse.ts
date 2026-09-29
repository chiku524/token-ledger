import { postJournalEntry } from "./post";
import type { PostedJournalEntry } from "./types";

export interface ReversalInput {
  id?: string;
  reference: string;
  entryDate: string;
  memo: string;
}

/**
 * Build a balanced reversing entry. The original is left unchanged.
 * Quantity direction flips with the accounting side so the subledger reverses too.
 */
export function reverseJournalEntry(entry: PostedJournalEntry, input: ReversalInput): PostedJournalEntry {
  return postJournalEntry({
    id: input.id,
    entityId: entry.entityId,
    reference: input.reference,
    entryDate: input.entryDate,
    memo: input.memo,
    lines: entry.lines.map((line) => ({
      accountCode: line.accountCode,
      side: line.side === "debit" ? "credit" : "debit",
      amountMinor: line.amountMinor,
      currency: line.currency,
      quantityMinor: line.quantityMinor,
      assetCode: line.assetCode,
      quantityDirection: line.quantityDirection === undefined ? undefined : line.quantityDirection === "in" ? "out" : "in",
      sourceId: line.sourceId,
      memo: line.memo,
    })),
  });
}
