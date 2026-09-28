import type { PostedJournalEntry } from "@/ledger";
import { LedgerError } from "@/ledger";
import type { JournalSyncBatch } from "./types";

/** Map posted ledger entries into the payload accounting adapters will send later. */
export function toJournalSyncBatch(
  entity: { name: string; functionalCurrency: string },
  entries: readonly PostedJournalEntry[],
): JournalSyncBatch {
  for (const entry of entries) {
    if (entry.currency !== entity.functionalCurrency) {
      throw new LedgerError(
        "MIXED_CURRENCY",
        `Entry ${entry.reference} is in ${entry.currency}, not ${entity.functionalCurrency}.`,
      );
    }
  }

  return {
    entityName: entity.name,
    functionalCurrency: entity.functionalCurrency,
    entries: entries.map((entry) => ({
      reference: entry.reference,
      entryDate: entry.entryDate,
      memo: entry.memo,
      lines: entry.lines.map((line) => ({
        accountCode: line.accountCode,
        side: line.side,
        amountMinor: line.amountMinor,
        currency: line.currency,
        description: line.memo,
      })),
    })),
  };
}
