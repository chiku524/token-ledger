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
  readonly implemented: boolean;
  readonly descriptor: AdapterDescriptor;
  /**
   * Push already-posted, already-balanced entries. Must be idempotent: a retry
   * with the same entries must not create duplicates.
   */
  pushJournalEntries(batch: JournalSyncBatch): Promise<JournalSyncResult>;
}

/**
 * A stable idempotency key for one entry, so a retry cannot duplicate it. Both
 * Xero (`Idempotency-Key`) and QuickBooks (`requestid`) use a client-supplied
 * key for this; deriving it from the ledger reference keeps it stable across
 * retries and processes.
 */
export function idempotencyKeyFor(reference: string): string {
  const normalised = reference.trim().replace(/[^A-Za-z0-9._-]/g, "-");
  return `token-ledger-${normalised}`.slice(0, 64);
}
