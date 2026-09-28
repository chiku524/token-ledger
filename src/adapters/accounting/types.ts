import type { Side } from "@/ledger";
import type { AdapterDescriptor } from "../types";

export interface JournalSyncLine {
  accountCode: string;
  side: Side;
  amountMinor: bigint;
  currency: string;
  description?: string;
}

export interface JournalSyncEntry {
  reference: string;
  entryDate: string;
  memo: string;
  lines: JournalSyncLine[];
}

/** Payload a Xero, QuickBooks, or ERP adapter should accept. Already balanced. */
export interface JournalSyncBatch {
  entityName: string;
  functionalCurrency: string;
  entries: JournalSyncEntry[];
}

export interface JournalSyncResult {
  externalBatchId: string;
  accepted: number;
}

export interface AccountingSyncAdapter {
  readonly system: "xero" | "quickbooks" | "erp";
  readonly implemented: false;
  readonly descriptor: AdapterDescriptor;
  pushJournalEntries(batch: JournalSyncBatch): Promise<JournalSyncResult>;
}
