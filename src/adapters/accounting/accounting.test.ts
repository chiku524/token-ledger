import { describe, expect, it, vi } from "vitest";
import { toJournalSyncBatch } from "./map";
import { idempotencyKeyFor } from "./types";
import { toXeroManualJournal, toXeroRequests } from "./xero-map";
import { toQboJournalEntry, toQboRequests } from "./quickbooks-map";
import { XeroSyncAdapter } from "./xero";
import { QuickBooksSyncAdapter } from "./quickbooks";
import { ErpSyncAdapter, InMemoryErpClient } from "./erp";
import { buildXeroAuthorizeUrl, XERO_SCOPES } from "./xero-client";
import { buildQboAuthorizeUrl, QBO_SCOPES } from "./quickbooks-client";

const entry = {
  reference: "JE-2026-001",
  entryDate: "2026-04-02",
  memo: "Share capital subscribed.",
  lines: [
    { accountCode: "1000", side: "debit" as const, amountMinor: 50_000_000n, currency: "MYR" },
    { accountCode: "3100", side: "credit" as const, amountMinor: 50_000_000n, currency: "MYR" },
  ],
};
const batch = { entityName: "Harbourline Sdn. Bhd.", functionalCurrency: "MYR", entries: [entry] };

describe("toJournalSyncBatch", () => {
  it("maps posted entries and rejects a mixed currency", () => {
    const built = toJournalSyncBatch(
      { name: "Harbourline", functionalCurrency: "MYR" },
      [{ entityId: "e", id: "j1", reference: "JE-1", entryDate: "2026-04-02", memo: "m", currency: "MYR", debitMinor: 1n, creditMinor: 1n, lines: [{ accountCode: "1000", side: "debit", amountMinor: 1n, currency: "MYR", lineNumber: 1 }] } as never],
    );
    expect(built.entries[0]?.reference).toBe("JE-1");
    expect(() =>
      toJournalSyncBatch(
        { name: "Harbourline", functionalCurrency: "MYR" },
        [{ entityId: "e", id: "j2", reference: "JE-2", entryDate: "2026-04-02", memo: "m", currency: "SGD", debitMinor: 1n, creditMinor: 1n, lines: [] } as never],
      ),
    ).toThrow(/SGD/);
  });
});

describe("idempotencyKeyFor", () => {
  it("is stable and safe for a header", () => {
    expect(idempotencyKeyFor("JE-2026-001")).toBe(idempotencyKeyFor("JE-2026-001"));
    expect(idempotencyKeyFor("JE 2026/001")).not.toMatch(/[^A-Za-z0-9._-]/);
    expect(idempotencyKeyFor("x".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("Xero mapping", () => {
  it("signs line amounts: debit positive, credit negative, POSTED, NoTax", () => {
    const journal = toXeroManualJournal(entry);
    expect(journal.Status).toBe("POSTED");
    expect(journal.LineAmountTypes).toBe("NoTax");
    expect(journal.JournalLines[0]).toMatchObject({ AccountCode: "1000", LineAmount: 500000 });
    expect(journal.JournalLines[1]).toMatchObject({ AccountCode: "3100", LineAmount: -500000 });
  });

  it("produces one request per entry with a stable idempotency key", () => {
    const [request] = toXeroRequests([entry]);
    expect(request?.ManualJournals).toHaveLength(1);
    expect(request?.idempotencyKey).toBe(idempotencyKeyFor("JE-2026-001"));
  });
});

describe("XeroSyncAdapter", () => {
  it("posts one journal per entry, idempotently keyed", async () => {
    const post = vi.fn(async (_body: unknown, key: string) => ({ id: `xero-${key}` }));
    const result = await new XeroSyncAdapter({ post }).pushJournalEntries(batch);
    expect(result.accepted).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[1]).toBe(idempotencyKeyFor("JE-2026-001"));
  });

  it("requires tokens and a tenant when no test seam is given", async () => {
    await expect(new XeroSyncAdapter().pushJournalEntries(batch)).rejects.toThrow(/token|tenant/i);
  });
});

describe("QuickBooks mapping", () => {
  it("marks posting types and keeps amounts positive", () => {
    const qbo = toQboJournalEntry(entry, "MYR");
    expect(qbo.CurrencyRef.value).toBe("MYR");
    expect(qbo.Line[0]).toMatchObject({ Amount: 500000, JournalEntryLineDetail: { PostingType: "Debit" } });
    expect(qbo.Line[1]).toMatchObject({ Amount: 500000, JournalEntryLineDetail: { PostingType: "Credit" } });
  });

  it("uses a stable request id per entry", () => {
    const [request] = toQboRequests([entry], "MYR");
    expect(request?.requestId).toBe(idempotencyKeyFor("JE-2026-001"));
  });
});

describe("QuickBooksSyncAdapter", () => {
  it("posts and requires tokens when no test seam is given", async () => {
    const post = vi.fn(async () => ({ id: "qbo-1" }));
    const result = await new QuickBooksSyncAdapter({ post }).pushJournalEntries(batch);
    expect(result.accepted).toBe(1);
    await expect(new QuickBooksSyncAdapter().pushJournalEntries(batch)).rejects.toThrow(/token|realm/i);
  });
});

describe("generic ERP port", () => {
  it("is idempotent through the client", async () => {
    const client = new InMemoryErpClient();
    const adapter = new ErpSyncAdapter({ client, target: "NetSuite" });
    const first = await adapter.pushJournalEntries(batch);
    const second = await adapter.pushJournalEntries(batch);
    expect(first.externalBatchId).toBe(second.externalBatchId);
    expect(first.externalBatchId).toMatch(/^erp-/);
  });
});

describe("OAuth URL building", () => {
  it("builds a Xero authorize URL with the read+post scopes", () => {
    const url = new URL(buildXeroAuthorizeUrl({ clientId: "id", clientSecret: "s", redirectUri: "https://app/cb" }, "state-1"));
    expect(url.origin + url.pathname).toBe("https://login.xero.com/identity/connect/authorize");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toContain("accounting.transactions");
    expect(XERO_SCOPES).toContain("offline_access");
  });

  it("builds a QuickBooks authorize URL with the accounting scope", () => {
    const url = new URL(buildQboAuthorizeUrl({ clientId: "id", clientSecret: "s", redirectUri: "https://app/cb" }, "state-2"));
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("id");
    expect(QBO_SCOPES).toContain("com.intuit.quickbooks.accounting");
  });
});
