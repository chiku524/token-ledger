/**
 * Live Xero adapter. Pushes already-posted, already-balanced entries as POSTED
 * manual journals, one request per entry, each with a stable `Idempotency-Key`
 * derived from the ledger reference so a retry cannot duplicate it.
 * See docs/adr-accounting-sync.md.
 */
import type { AdapterDescriptor } from "../types";
import type { AccountingSyncAdapter, JournalSyncBatch, JournalSyncResult } from "./types";
import { postXeroManualJournal, type XeroTokens } from "./xero-client";
import { toXeroRequests } from "./xero-map";

export interface XeroSyncAdapterOptions {
  tokens?: XeroTokens;
  tenantId?: string;
  fetchImpl?: typeof fetch;
  /** Test seam: replace the per-entry post. */
  post?: (body: unknown, idempotencyKey: string) => Promise<{ id: string }>;
}

export class XeroSyncAdapter implements AccountingSyncAdapter {
  readonly system = "xero" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Xero",
    category: "accounting",
    system: "xero",
    implemented: true,
    summary: "Posts posted entries to Xero as manual journals, idempotently. An OAuth token is stored sealed.",
  };
  private readonly options: XeroSyncAdapterOptions;

  constructor(options: XeroSyncAdapterOptions = {}) {
    this.options = options;
  }

  async pushJournalEntries(batch: JournalSyncBatch): Promise<JournalSyncResult> {
    const requests = toXeroRequests(batch.entries);
    const ids: string[] = [];
    for (const request of requests) {
      const result = await this.postEntry(request.ManualJournals, request.idempotencyKey);
      ids.push(result.id);
    }
    return { externalBatchId: ids[0] ?? "xero-empty", accepted: requests.length };
  }

  private async postEntry(body: unknown, idempotencyKey: string): Promise<{ id: string }> {
    if (this.options.post) return this.options.post(body, idempotencyKey);
    if (!this.options.tokens || !this.options.tenantId) {
      throw new Error("Xero needs an access token and tenant id.");
    }
    const result = await postXeroManualJournal(
      this.options.tokens.accessToken,
      this.options.tenantId,
      body,
      idempotencyKey,
      this.options.fetchImpl,
    );
    return { id: result.id };
  }
}
