import { describe, expect, it, vi } from "vitest";
import {
  AdapterNotImplementedError,
  BitcoinChainAdapter,
  ConnectionClosedError,
  CustodianSourceAdapter,
  ErpSyncAdapter,
  EthereumChainAdapter,
  ExchangeSourceAdapter,
  KrakenExchangeAdapter,
  listLiveAdapters,
  listStubAdapters,
  PolygonChainAdapter,
  pullReadOnly,
  QuickBooksSyncAdapter,
  SolanaChainAdapter,
  statusAfterSyncFailure,
  SuiChainAdapter,
  XeroSyncAdapter,
} from "./index";

const query = { since: "2026-04-01", until: "2026-06-30", externalAccountId: "example" };
const batch = {
  entityName: "Harbourline Digital Sdn. Bhd.",
  functionalCurrency: "MYR",
  entries: [],
};

describe("adapters", () => {
  it("lists the still-unimplemented connectors", () => {
    const systems = listStubAdapters().map((adapter) => adapter.system);
    expect(systems).toEqual(["exchange", "custodian", "xero", "quickbooks", "erp"]);
    expect(listStubAdapters().every((adapter) => adapter.implemented === false)).toBe(true);
  });

  it("lists the live chain connectors", () => {
    expect(listLiveAdapters().map((adapter) => adapter.system)).toEqual(["Ethereum", "Solana", "Polygon", "Bitcoin", "Sui", "kraken"]);
    expect(listLiveAdapters().every((adapter) => adapter.implemented === true)).toBe(true);
  });

  it("does not call fetch or read credentials for stubs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
    const adapters = [new ExchangeSourceAdapter(), new CustodianSourceAdapter()];

    for (const adapter of adapters) {
      await expect(adapter.fetchTransactions(query)).rejects.toBeInstanceOf(AdapterNotImplementedError);
      await expect(adapter.fetchBalances(query)).rejects.toBeInstanceOf(AdapterNotImplementedError);
      await expect(adapter.listAccounts(query)).rejects.toBeInstanceOf(AdapterNotImplementedError);
    }
    await expect(new XeroSyncAdapter().pushJournalEntries(batch)).rejects.toBeInstanceOf(AdapterNotImplementedError);
    await expect(new QuickBooksSyncAdapter().pushJournalEntries(batch)).rejects.toBeInstanceOf(AdapterNotImplementedError);
    await expect(new ErpSyncAdapter().pushJournalEntries(batch)).rejects.toBeInstanceOf(AdapterNotImplementedError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.env.XERO_CLIENT_SECRET).toBeUndefined();
    expect(process.env.QUICKBOOKS_CLIENT_SECRET).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it("exposes Solana as implemented and validates the address", async () => {
    const adapter = new SolanaChainAdapter();
    expect(adapter.implemented).toBe(true);
    expect(adapter.descriptor.implemented).toBe(true);
    await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/address is required/i);
  });

  it("exposes Ethereum and Polygon as implemented and validates the address", async () => {
    for (const adapter of [new EthereumChainAdapter(), new PolygonChainAdapter()]) {
      expect(adapter.implemented).toBe(true);
      expect(adapter.descriptor.implemented).toBe(true);
      await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/address is required/i);
    }
  });

  it("exposes Bitcoin as implemented and validates the address", async () => {
    const adapter = new BitcoinChainAdapter();
    expect(adapter.implemented).toBe(true);
    expect(adapter.descriptor.implemented).toBe(true);
    await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/address is required/i);
  });

  it("exposes Sui as implemented and validates the address", async () => {
    const adapter = new SuiChainAdapter();
    expect(adapter.implemented).toBe(true);
    expect(adapter.descriptor.implemented).toBe(true);
    await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/address is required/i);
  });

  it("exposes Kraken as implemented and needs an account", async () => {
    const adapter = new KrakenExchangeAdapter();
    expect(adapter.implemented).toBe(true);
    expect(adapter.descriptor.implemented).toBe(true);
    expect(adapter.descriptor.system).toBe("kraken");
    await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/account reference/i);
  });

  it("pulls through a stub and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
    await expect(
      pullReadOnly({ mode: "exchange_read", venue: "exchange", status: "pending" }, "acct", "2026-04-01"),
    ).rejects.toBeInstanceOf(AdapterNotImplementedError);
    await expect(
      pullReadOnly({ mode: "exchange_read", venue: "exchange", status: "revoked" }, "acct", "2026-04-01"),
    ).rejects.toBeInstanceOf(ConnectionClosedError);
    expect(statusAfterSyncFailure("healthy")).toBe("degraded");
    expect(statusAfterSyncFailure("pending")).toBe("pending");
    expect(statusAfterSyncFailure("revoked")).toBe("revoked");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
