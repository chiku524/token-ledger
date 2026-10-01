/**
 * Map a ledger entry to a Xero ManualJournal. Xero line amounts are signed:
 * a debit is positive, a credit is negative. The journal is posted with
 * `LineAmountTypes: NoTax` and `Status: POSTED`, so it does not sit as a draft.
 */
import { toMajorUnits } from "./http";
import { idempotencyKeyFor, type JournalSyncEntry } from "./types";

export interface XeroManualJournalLine {
  AccountCode: string;
  Description: string;
  LineAmount: number;
}

export interface XeroManualJournal {
  Narration: string;
  Date: string;
  LineAmountTypes: "NoTax";
  Status: "POSTED";
  JournalLines: XeroManualJournalLine[];
}

export interface XeroManualJournalRequest {
  ManualJournals: XeroManualJournal[];
  /** The idempotency key for this entry, sent as the `Idempotency-Key` header. */
  idempotencyKey: string;
}

export function toXeroManualJournal(entry: JournalSyncEntry): XeroManualJournal {
  return {
    Narration: entry.memo.slice(0, 255) || entry.reference,
    Date: entry.entryDate,
    LineAmountTypes: "NoTax",
    Status: "POSTED",
    JournalLines: entry.lines.map((line) => {
      const signed = line.side === "debit" ? line.amountMinor : -line.amountMinor;
      return {
        AccountCode: line.accountCode,
        Description: (line.description ?? entry.memo).slice(0, 255),
        LineAmount: Number(toMajorUnits(signed)),
      };
    }),
  };
}

/** One request per entry, each with its own idempotency key. */
export function toXeroRequests(entries: readonly JournalSyncEntry[]): XeroManualJournalRequest[] {
  return entries.map((entry) => ({
    ManualJournals: [toXeroManualJournal(entry)],
    idempotencyKey: idempotencyKeyFor(entry.reference),
  }));
}
