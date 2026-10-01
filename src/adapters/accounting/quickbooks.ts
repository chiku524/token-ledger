/**
 * Live QuickBooks Online adapter. Pushes already-posted, already-balanced
 * entries as JournalEntry objects, one request per entry, each with a stable
 * `requestid` derived from the ledger reference so a retry cannot duplicate it.
 * See docs/adr-accounting-sync.md.
 */
import type { AdapterDescriptor } from "../types";
import type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./types";
import { postQboJournalEntry, type QboTokens } from "./quickbooks-client";
import { toQboRequests } from "./quickbooks-map";

export interface QuickBooksSyncAdapterOptions {
  tokens?: QboTokens;
  sandbox?: boolean;
  fetchImpl?: typeof fetch;
  /** Maps a ledger account code to a QBO account ref. Defaults to the code as name. */
  accountRef?: (accountCode: string) => { name?: string; value?: string };
  /** Test seam: replace the per-entry post. */
  post?: (body: unknown, requestId: string) => Promise<{ id: string }>;
}

export class QuickBooksSyncAdapter implements AccountingSyncAdapter {
  readonly system = "quickbooks" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "QuickBooks",
    category: "accounting",
    system: "quickbooks",
    implemented: true,
    summary: "Posts posted entries to QuickBooks Online as journal entries, idempotently. An OAuth token is stored sealed.",
  };
  private readonly options: QuickBooksSyncAdapterOptions;

  constructor(options: QuickBooksSyncAdapterOptions = {}) {
    this.options = options;
  }

  async pushJournalEntries(batch: JournalSyncBatch): Promise<JournalSyncResult> {
    const requests = toQboRequests(batch.entries, batch.functionalCurrency, this.options.accountRef);
    const ids: string[] = [];
    for (const request of requests) {
      const result = await this.postEntry(request.entry, request.requestId);
      ids.push(result.id);
    }
    return { externalBatchId: ids[0] ?? "qbo-empty", accepted: requests.length };
  }

  private async postEntry(body: unknown, requestId: string): Promise<{ id: string }> {
    if (this.options.post) return this.options.post(body, requestId);
    if (!this.options.tokens) {
      throw new Error("QuickBooks needs an access token and realm id.");
    }
    const result = await postQboJournalEntry(this.options.tokens, body, requestId, {
      sandbox: this.options.sandbox,
      fetchImpl: this.options.fetchImpl,
    });
    return { id: result.id };
  }
}
