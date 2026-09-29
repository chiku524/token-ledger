import { ledgerQuantityMovements, reconcileMovements } from "@/ledger";
import type { PostedJournalEntry } from "@/ledger";
import type { BooksReconciliation, BooksSourceTransaction } from "./books";

/** Match source facts to ledger movements. The date on each row is the fact's date, so a period filter can drop it. */
export function buildReconciliations(
  organizationId: string,
  transactions: readonly BooksSourceTransaction[],
  entries: readonly PostedJournalEntry[],
  fallbackDate: string,
): BooksReconciliation[] {
  const ledgerMovements = ledgerQuantityMovements(entries);
  const movementById = new Map(ledgerMovements.map((movement) => [movement.id, movement]));
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  return reconcileMovements(transactions, ledgerMovements).map((match, index) => {
    const movement = match.ledgerMovementId ? movementById.get(match.ledgerMovementId) : undefined;
    const transaction = match.sourceTransactionId ? transactionById.get(match.sourceTransactionId) : undefined;
    const entry = movement ? entryById.get(movement.journalEntryId) : undefined;
    const day = transaction?.occurredOn ?? entry?.entryDate ?? fallbackDate;
    return {
      id: `recon_${String(index + 1).padStart(2, "0")}`,
      organizationId,
      entityId: match.entityId,
      periodStart: day,
      periodEnd: day,
      status: match.status,
      sourceId: match.sourceId,
      assetCode: match.assetCode,
      direction: match.direction,
      quantityMinor: match.quantityMinor,
      sourceTransactionId: match.sourceTransactionId,
      journalEntryId: movement?.journalEntryId ?? null,
      journalLineNumber: movement?.lineNumber ?? null,
      note: match.note,
    };
  });
}
