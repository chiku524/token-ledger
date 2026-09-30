import { describe, expect, it, vi } from "vitest";
import {
  AdapterNotImplementedError,
  ConnectionClosedError,
  CustodianSourceAdapter,
  ErpSyncAdapter,
  EthereumChainAdapter,
  ExchangeSourceAdapter,
  listStubAdapters,
  PolygonChainAdapter,
  pullReadOnly,
  QuickBooksSyncAdapter,
  SolanaChainAdapter,
  statusAfterSyncFailure,
  XeroSyncAdapter,
} from "./index";

const query = { since: "2026-04-01", until: "2026-06-30", externalAccountId: "example" };
const batch = {
  entityName: "Harbourline Digital Sdn. Bhd.",
  functionalCurrency: "MYR",
  entries: [],
};

describe("stub adapters", () => {
  it("lists every planned connector as unimplemented", () => {
    const systems = listStubAdapters().map((adapter) => adapter.system);
    expect(systems).toEqual(["Ethereum", "Solana", "Polygon", "exchange", "custodian", "xero", "quickbooks", "erp"]);
    expect(listStubAdapters().every((adapter) => adapter.implemented === false)).toBe(true);
  });

  it("does not call fetch or read credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
    const adapters = [
      new EthereumChainAdapter(),
      new SolanaChainAdapter(),
      new PolygonChainAdapter(),
      new ExchangeSourceAdapter(),
      new CustodianSourceAdapter(),
    ];

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

  it("pulls through the stub and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
    await expect(
      pullReadOnly({ mode: "watch", venue: "ethereum", status: "pending" }, "0xabc", "2026-04-01"),
    ).rejects.toBeInstanceOf(AdapterNotImplementedError);
    await expect(
      pullReadOnly({ mode: "watch", venue: "ethereum", status: "revoked" }, "0xabc", "2026-04-01"),
    ).rejects.toBeInstanceOf(ConnectionClosedError);
    expect(statusAfterSyncFailure("healthy")).toBe("degraded");
    expect(statusAfterSyncFailure("pending")).toBe("pending");
    expect(statusAfterSyncFailure("revoked")).toBe("revoked");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
