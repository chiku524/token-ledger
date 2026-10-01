/**
 * End-to-end read of a Kraken account through the public adapter surface:
 * assets held, observed balances, and movements. Offline — the Kraken client
 * is a fake, so this runs in CI.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { KrakenExchangeAdapter } from "../exchange";
import { KrakenReader } from "./kraken-reader";
import type { KrakenClient } from "./kraken-client";
import type {
  KrakenAssetsResult,
  KrakenLedgersResult,
  KrakenTradesResult,
} from "./kraken-responses";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const assets = fixture<{ result: KrakenAssetsResult }>("assets.json").result;
const balance = fixture<{ result: Record<string, string> }>("balance.json").result;
const ledgers = fixture<{ result: KrakenLedgersResult }>("ledgers.json").result;
const trades = fixture<{ result: KrakenTradesResult }>("trades.json").result;

/** A fake Kraken client: only the read methods the reader calls. */
function fakeClient(): KrakenClient {
  return {
    getAssets: vi.fn(async () => assets),
    getBalance: vi.fn(async () => ({ error: [], result: balance })),
    getLedgers: vi.fn(async () => ({ error: [], result: ledgers })),
    getTradesHistory: vi.fn(async () => ({ error: [], result: trades })),
  } as unknown as KrakenClient;
}

describe("reading a Kraken account", () => {
  const query = { since: "2024-08-01", until: "2024-09-30", externalAccountId: "kraken-main" };
  const adapter = new KrakenExchangeAdapter({ client: fakeClient() });

  it("returns balances for the account", async () => {
    const balances = await adapter.fetchBalances(query);
    const byCode = Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(1_234_567_800n);
    expect(byCode.USD).toBe(15_002_500n);
    expect(byCode.SOL).toBe(125_000_000_000n);
  });

  it("returns deposits, withdrawals, and trades as movements", async () => {
    const movements = await adapter.fetchTransactions(query);
    const ids = movements.map((movement) => movement.externalId);
    expect(ids).toContain("kraken-ledger-L1"); // deposit
    expect(ids).toContain("kraken-ledger-L2"); // withdrawal
    expect(ids).toContain("kraken-trade-TT1");
    // Trade ledger legs are excluded to avoid double counting.
    expect(ids).not.toContain("kraken-ledger-L3");
    expect(movements.every((movement) => movement.chain === "kraken")).toBe(true);
  });

  it("lists the single account behind the connection", async () => {
    await expect(adapter.listAccounts(query)).resolves.toEqual([
      { externalAccountId: "kraken-main", name: "Kraken account", chain: "kraken" },
    ]);
  });

  it("requires an account reference", async () => {
    await expect(adapter.fetchBalances({ since: "2024-08-01" })).rejects.toThrow(/account reference/i);
  });
});
