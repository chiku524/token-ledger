/**
 * STUB ERP adapter. No NetSuite, SAP, or other ERP client and no credentials.
 * Point `target` at the customer's ledger when this is implemented.
 */
import { AdapterNotImplementedError } from "../errors";
import type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./types";

export class ErpSyncAdapter implements AccountingSyncAdapter {
  readonly system = "erp" as const;
  readonly implemented = false as const;
  readonly target = "unspecified";
  readonly descriptor = {
    name: "ERP sync adapter",
    category: "accounting" as const,
    system: "erp",
    implemented: false as const,
    summary: "Push balanced journal entries to an ERP. Stub only — no ERP is contacted.",
  };

  pushJournalEntries(_batch: JournalSyncBatch): Promise<JournalSyncResult> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }
}
