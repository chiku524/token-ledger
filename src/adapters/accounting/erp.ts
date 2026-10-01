/**
 * Generic ERP sync port. An ERP connector is anything that can accept a
 * `JournalSyncBatch` and return a `JournalSyncResult` (see `AccountingSyncAdapter`).
 * To add a system, implement that interface and register it; the ledger does not
 * change. `InMemoryErpAdapter` is a reference implementation and, by default, the
 * target of `ErpSyncAdapter` when no real client is configured.
 *
 * See docs/adr-accounting-sync.md.
 */
import type { AdapterDescriptor } from "../types";
import { idempotencyKeyFor, type AccountingSyncAdapter, type JournalSyncBatch, type JournalSyncResult } from "./types";

/**
 * A minimal, generic ERP client. A real ERP (NetSuite, SAP, Dynamics, a custom
 * ledger) provides these two methods; everything else is the mapper and the port.
 */
export interface ErpClient {
  /** Whether an entry already exists for an idempotency key, and its external id. */
  findByKey(key: string): Promise<{ id: string } | null>;
  /** Create an entry for an idempotency key. Must be idempotent. */
  create(key: string, batch: JournalSyncBatch): Promise<{ id: string }>;
}

/** A reference ERP client that stores entries in memory. Useful for tests and demos. */
export class InMemoryErpClient implements ErpClient {
  private readonly entries = new Map<string, string>();

  async findByKey(key: string): Promise<{ id: string } | null> {
    const id = this.entries.get(key);
    return id ? { id } : null;
  }

  async create(key: string, _batch: JournalSyncBatch): Promise<{ id: string }> {
    const id = this.entries.get(key) ?? `erp-${this.entries.size + 1}`;
    this.entries.set(key, id);
    return { id };
  }
}

export interface ErpSyncAdapterOptions {
  target?: string;
  client?: ErpClient;
}

export class ErpSyncAdapter implements AccountingSyncAdapter {
  readonly system = "erp" as const;
  readonly implemented = true as const;
  readonly descriptor: AdapterDescriptor;
  private readonly client: ErpClient;

  constructor(options: ErpSyncAdapterOptions = {}) {
    // With no client the adapter targets the in-memory reference, which is not a
    // real ledger. That is honest in the summary and the descriptor's name.
    this.client = options.client ?? new InMemoryErpClient();
    const name = options.target ? `Other accounting software (${options.target})` : "Other accounting software (in-memory reference)";
    this.descriptor = {
      name,
      category: "accounting",
      system: "erp",
      implemented: true,
      summary: options.client
        ? "Posts posted entries to another accounting system through the generic ERP port, idempotently."
        : "Reference ERP port, idempotent. Configure a client for a real ERP (NetSuite, SAP, and so on).",
    };
  }

  async pushJournalEntries(batch: JournalSyncBatch): Promise<JournalSyncResult> {
    const ids: string[] = [];
    for (const entry of batch.entries) {
      const key = idempotencyKeyFor(entry.reference);
      const existing = await this.client.findByKey(key);
      ids.push(existing ? existing.id : (await this.client.create(key, batch)).id);
    }
    return { externalBatchId: ids[0] ?? "erp-empty", accepted: batch.entries.length };
  }
}
