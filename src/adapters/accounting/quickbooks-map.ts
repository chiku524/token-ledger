/**
 * Map a ledger entry to a QuickBooks Online JournalEntry.
 *
 * QBO line amounts are positive with a `PostingType` of `Debit` or `Credit`.
 * The account is referenced by name here; a real deployment maps ledger codes
 * to QBO account ids (see the adapter's `accountRef` option).
 */
import { toMajorUnits } from "./http";
import { idempotencyKeyFor, type JournalSyncEntry } from "./types";

export interface QboJournalLine {
  Description: string;
  Amount: number;
  DetailType: "JournalEntryLineDetail";
  JournalEntryLineDetail: {
    PostingType: "Debit" | "Credit";
    AccountRef: { name?: string; value?: string };
  };
}

export interface QboJournalEntry {
  DocNumber: string;
  TxnDate: string;
  PrivateNote: string;
  CurrencyRef: { value: string };
  Line: QboJournalLine[];
}

export interface QboJournalRequest {
  entry: QboJournalEntry;
  /** Sent as the `requestid` query parameter for idempotent retries. */
  requestId: string;
}

export function toQboJournalEntry(
  entry: JournalSyncEntry,
  functionalCurrency: string,
  accountRef: (accountCode: string) => { name?: string; value?: string } = (code) => ({ name: code }),
): QboJournalEntry {
  return {
    DocNumber: entry.reference.slice(0, 21),
    TxnDate: entry.entryDate,
    PrivateNote: entry.memo.slice(0, 4000),
    CurrencyRef: { value: functionalCurrency },
    Line: entry.lines.map((line) => ({
      Description: (line.description ?? entry.memo).slice(0, 4000),
      Amount: Number(toMajorUnits(line.amountMinor)),
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: line.side === "debit" ? "Debit" : "Credit",
        AccountRef: accountRef(line.accountCode),
      },
    })),
  };
}

export function toQboRequests(
  entries: readonly JournalSyncEntry[],
  functionalCurrency: string,
  accountRef?: (accountCode: string) => { name?: string; value?: string },
): QboJournalRequest[] {
  return entries.map((entry) => ({
    entry: toQboJournalEntry(entry, functionalCurrency, accountRef),
    requestId: idempotencyKeyFor(entry.reference),
  }));
}
