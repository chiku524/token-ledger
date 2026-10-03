import { describe, expect, it, vi } from "vitest";
import {
  AdapterNotImplementedError,
  adapterForConnection,
  BitcoinChainAdapter,
  ConnectionClosedError,
  CustodianSourceAdapter,
  ErpSyncAdapter,
  EthereumChainAdapter,
  ExchangeSourceAdapter,
  FireblocksCustodianAdapter,
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
import { WATCH_VENUE_KEYS } from "@/data/connections";

const query = { since: "2026-04-01", until: "2026-06-30", externalAccountId: "example" };

describe("adapters", () => {
  it("lists the still-unimplemented connectors", () => {
    const systems = listStubAdapters().map((adapter) => adapter.system);
    expect(systems).toEqual(["exchange", "custodian"]);
    expect(listStubAdapters().every((adapter) => adapter.implemented === false)).toBe(true);
  });

  it("lists the live chain connectors", () => {
    expect(listLiveAdapters().map((adapter) => adapter.system)).toEqual(["Ethereum", "Solana", "Polygon", "Bitcoin", "Sui", "kraken", "bybit", "binance", "gate", "backpack", "coinbase", "gemini", "okx", "kucoin", "fireblocks", "bitgo", "xero", "quickbooks", "erp"]);
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

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(process.env.XERO_CLIENT_SECRET).toBeUndefined();
    expect(process.env.QUICKBOOKS_CLIENT_SECRET).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it("lists the accounting sync adapters as implemented", () => {
    expect(new XeroSyncAdapter().implemented).toBe(true);
    expect(new QuickBooksSyncAdapter().implemented).toBe(true);
    expect(new ErpSyncAdapter().implemented).toBe(true);
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

  it("resolves every supported watch chain through adapterForConnection", () => {
    // Guards the gap where an adapter is implemented but unreachable from the app.
    for (const venue of WATCH_VENUE_KEYS) {
      const adapter = adapterForConnection({ mode: "watch", venue });
      expect(adapter, `${venue} is selectable but adapterForConnection returns null`).not.toBeNull();
      expect(adapter?.implemented).toBe(true);
      expect(adapter?.kind).toBe("chain");
      if (adapter?.kind === "chain") expect(adapter.chain).toBe(venue);
    }
  });

  it("exposes Fireblocks as implemented and needs a vault account id", async () => {
    const adapter = new FireblocksCustodianAdapter();
    expect(adapter.implemented).toBe(true);
    expect(adapter.descriptor.implemented).toBe(true);
    expect(adapter.descriptor.system).toBe("fireblocks");
    await expect(adapter.fetchBalances({ since: "2026-04-01" })).rejects.toThrow(/vault account id/i);
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
