/**
 * STUB Xero adapter. No OAuth client, no Xero API call, no client id or secret.
 * `pushJournalEntries` should later create manual journals in the entity's Xero org.
 */
import { AdapterNotImplementedError } from "../errors";
import type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./types";

export class XeroSyncAdapter implements AccountingSyncAdapter {
  readonly system = "xero" as const;
  readonly implemented = false as const;
  readonly descriptor = {
    name: "Xero",
    category: "accounting" as const,
    system: "xero",
    implemented: false as const,
    summary: "Sends posted entries to Xero. Not connected yet.",
  };

  pushJournalEntries(_batch: JournalSyncBatch): Promise<JournalSyncResult> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }
}
