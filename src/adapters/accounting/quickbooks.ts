/**
 * STUB QuickBooks adapter. No OAuth client, no Intuit API call, no client id or secret.
 * `pushJournalEntries` should later create journal entries in QuickBooks.
 */
import { AdapterNotImplementedError } from "../errors";
import type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./types";

export class QuickBooksSyncAdapter implements AccountingSyncAdapter {
  readonly system = "quickbooks" as const;
  readonly implemented = false as const;
  readonly descriptor = {
    name: "QuickBooks sync adapter",
    category: "accounting" as const,
    system: "quickbooks",
    implemented: false as const,
    summary: "Push balanced journal entries to QuickBooks. Stub only — QuickBooks is not contacted.",
  };

  pushJournalEntries(_batch: JournalSyncBatch): Promise<JournalSyncResult> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }
}
