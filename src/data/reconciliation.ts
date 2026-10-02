import { ledgerQuantityMovements, reconcileMovements } from "@/ledger";
import type { PostedJournalEntry } from "@/ledger";
import type { BooksReconciliation, BooksSourceTransaction } from "./books";

/** A human reconciliation decision, overlaid on the automatic result. */
export interface ReconciliationOverride {
  sourceTransactionId: string;
  journalEntryId: string | null;
  journalLineNumber: number | null;
  kind: "match" | "unmatch";
  note: string;
}

/**
 * Candidate journal lines for one exception: a quantity movement on the same
 * entity, source, asset, and direction. These are what an accountant may pair the
 * activity with. Pure, so the UI and its tests share the rule.
 */
export function candidateJournalLines(
  transaction: Pick<BooksSourceTransaction, "entityId" | "sourceId" | "assetCode" | "direction">,
  ledgerMovements: readonly { id: string; entityId: string; sourceId: string; assetCode: string; direction: "in" | "out"; quantityMinor: bigint; journalEntryId: string; lineNumber: number }[],
  referenceOf: (entryId: string) => string,
): Array<{ id: string; label: string; journalEntryId: string; journalLineNumber: number; quantityMinor: bigint }> {
  return ledgerMovements
    .filter(
      (movement) =>
        movement.entityId === transaction.entityId &&
        movement.sourceId === transaction.sourceId &&
        movement.assetCode === transaction.assetCode &&
        movement.direction === transaction.direction,
    )
    .map((movement) => ({
      id: `${movement.journalEntryId}:${movement.lineNumber}`,
      label: `${referenceOf(movement.journalEntryId)}:${movement.lineNumber}`,
      journalEntryId: movement.journalEntryId,
      journalLineNumber: movement.lineNumber,
      quantityMinor: movement.quantityMinor,
    }));
}

/**
 * Match source facts to ledger movements. The date on each row is the fact's
 * date, so a period filter can drop it. A manual override is applied after the
 * automatic pass: a `match` forces a pairing, an `unmatch` breaks the automatic
 * one, so a human decision always wins.
 */
export function buildReconciliations(
  organizationId: string,
  transactions: readonly BooksSourceTransaction[],
  entries: readonly PostedJournalEntry[],
  fallbackDate: string,
  overrides: readonly ReconciliationOverride[] = [],
): BooksReconciliation[] {
  const ledgerMovements = ledgerQuantityMovements(entries);
  const movementById = new Map(ledgerMovements.map((movement) => [movement.id, movement]));
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const overrideByTransaction = new Map(overrides.map((override) => [override.sourceTransactionId, override]));

  const rows = reconcileMovements(transactions, ledgerMovements).map((match, index) => {
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
    } satisfies BooksReconciliation;
  });

  // A manual match on a transaction the automatic pass could not pair becomes a
  // new matched row; an unmatch forces an automatic match to an exception.
  const result = rows.map((row) => {
    const override = row.sourceTransactionId ? overrideByTransaction.get(row.sourceTransactionId) : undefined;
    if (!override) return row;
    if (override.kind === "unmatch") {
      return { ...row, status: "exception" as const, journalEntryId: null, journalLineNumber: null, note: override.note };
    }
    return { ...row, status: "matched" as const, journalEntryId: override.journalEntryId, journalLineNumber: override.journalLineNumber, note: override.note };
  });

  for (const override of overrides) {
    if (override.kind !== "match") continue;
    if (result.some((row) => row.sourceTransactionId === override.sourceTransactionId)) continue;
    const transaction = transactionById.get(override.sourceTransactionId);
    if (!transaction) continue;
    result.push({
      id: `recon_manual_${override.sourceTransactionId}`,
      organizationId,
      entityId: transaction.entityId,
      periodStart: transaction.occurredOn,
      periodEnd: transaction.occurredOn,
      status: "matched",
      sourceId: transaction.sourceId,
      assetCode: transaction.assetCode,
      direction: transaction.direction,
      quantityMinor: transaction.quantityMinor,
      sourceTransactionId: transaction.id,
      journalEntryId: override.journalEntryId,
      journalLineNumber: override.journalLineNumber,
      note: override.note,
    });
  }

  return result;
}
