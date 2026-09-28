import type { PostedJournalEntry, QuantityDirection } from "./types";
import { LedgerError } from "./types";

export interface QuantityMovement {
  id: string;
  entityId: string;
  sourceId: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
}

export interface LedgerQuantityMovement extends QuantityMovement {
  journalEntryId: string;
  lineNumber: number;
}

export interface ReconciliationMatch {
  status: "matched" | "exception";
  entityId: string;
  sourceId: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  sourceTransactionId: string | null;
  ledgerMovementId: string | null;
  note: string;
}

export function ledgerQuantityMovements(entries: readonly PostedJournalEntry[]): LedgerQuantityMovement[] {
  const movements: LedgerQuantityMovement[] = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.quantityMinor === undefined) continue;
      if (!line.assetCode || !line.quantityDirection || !line.sourceId) {
        throw new LedgerError(
          "QUANTITY_WITHOUT_ASSET",
          `Posted line ${entry.reference}:${line.lineNumber} is missing quantity dimensions.`,
        );
      }
      movements.push({
        id: `${entry.id}:${line.lineNumber}`,
        entityId: entry.entityId,
        sourceId: line.sourceId,
        assetCode: line.assetCode,
        direction: line.quantityDirection,
        quantityMinor: line.quantityMinor,
        journalEntryId: entry.id,
        lineNumber: line.lineNumber,
      });
    }
  }
  return movements;
}

/**
 * Exact match on entity, source, asset, direction, and quantity.
 * Each source transaction and each ledger movement is used at most once.
 * Anything left over is an exception.
 */
export function reconcileMovements(
  sourceTransactions: readonly QuantityMovement[],
  ledgerMovements: readonly QuantityMovement[],
): ReconciliationMatch[] {
  const used = new Set<number>();
  const matches: ReconciliationMatch[] = [];

  for (const transaction of sourceTransactions) {
    const index = ledgerMovements.findIndex((movement, movementIndex) => {
      if (used.has(movementIndex)) return false;
      return samePosition(transaction, movement);
    });

    if (index === -1) {
      matches.push({
        status: "exception",
        entityId: transaction.entityId,
        sourceId: transaction.sourceId,
        assetCode: transaction.assetCode,
        direction: transaction.direction,
        quantityMinor: transaction.quantityMinor,
        sourceTransactionId: transaction.id,
        ledgerMovementId: null,
        note: "Source transaction has no matching ledger movement.",
      });
      continue;
    }

    used.add(index);
    const movement = ledgerMovements[index];
    if (!movement) continue;
    matches.push({
      status: "matched",
      entityId: transaction.entityId,
      sourceId: transaction.sourceId,
      assetCode: transaction.assetCode,
      direction: transaction.direction,
      quantityMinor: transaction.quantityMinor,
      sourceTransactionId: transaction.id,
      ledgerMovementId: movement.id,
      note: "Exact match on source, asset, direction, and quantity.",
    });
  }

  ledgerMovements.forEach((movement, index) => {
    if (used.has(index)) return;
    matches.push({
      status: "exception",
      entityId: movement.entityId,
      sourceId: movement.sourceId,
      assetCode: movement.assetCode,
      direction: movement.direction,
      quantityMinor: movement.quantityMinor,
      sourceTransactionId: null,
      ledgerMovementId: movement.id,
      note: "Ledger movement has no matching source transaction.",
    });
  });

  return matches;
}

function samePosition(left: QuantityMovement, right: QuantityMovement): boolean {
  return (
    left.entityId === right.entityId &&
    left.sourceId === right.sourceId &&
    left.assetCode === right.assetCode &&
    left.direction === right.direction &&
    left.quantityMinor === right.quantityMinor
  );
}
