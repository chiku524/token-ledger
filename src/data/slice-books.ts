import type { Books } from "./books";
import { rangesOverlap, withinRange, type DateRange } from "./period";

export function sliceBooks(books: Books, range: DateRange): Books {
  return {
    ...books,
    journalEntries: books.journalEntries.filter((entry) => withinRange(entry.entryDate, range)),
    sourceTransactions: books.sourceTransactions.filter((transaction) => withinRange(transaction.occurredOn, range)),
    reconciliations: books.reconciliations.filter((record) =>
      rangesOverlap({ start: record.periodStart, end: record.periodEnd }, range),
    ),
  };
}
