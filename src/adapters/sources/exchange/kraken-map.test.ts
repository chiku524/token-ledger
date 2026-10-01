import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assetCodeForKey, assetCodeFromEntry, decimalsForCode } from "./kraken-assets";
import {
  baseAssetOfPair,
  describeKrakenHoldings,
  mapKrakenBalances,
  mapKrakenLedgers,
  mapKrakenTrades,
} from "./kraken-map";
import type { KrakenAssetsResult, KrakenLedgersResult, KrakenTradesResult } from "./kraken-responses";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const assets = fixture<{ result: KrakenAssetsResult }>("assets.json").result;
const balance = fixture<{ result: Record<string, string> }>("balance.json").result;
const ledgers = fixture<{ result: KrakenLedgersResult }>("ledgers.json").result;
const trades = fixture<{ result: KrakenTradesResult }>("trades.json").result;

describe("Kraken asset normalization", () => {
  it("maps legacy prefixed keys and XBT to ledger codes", () => {
    expect(assetCodeForKey("XXBT", assets)).toBe("BTC");
    expect(assetCodeForKey("ZUSD", assets)).toBe("USD");
    expect(assetCodeForKey("SOL", assets)).toBe("SOL");
    expect(assetCodeFromEntry({ altname: "XBT" })).toBe("BTC");
  });

  it("reads decimals from the public Assets map", () => {
    expect(decimalsForCode("BTC", assets)).toBe(10);
    expect(decimalsForCode("USD", assets)).toBe(4);
    expect(decimalsForCode("SOL", assets)).toBe(10);
  });

  it("splits a pair into its base asset", () => {
    expect(baseAssetOfPair("XXBTZUSD")).toBe("XXBT");
    expect(baseAssetOfPair("SOLEUR")).toBe("SOL");
    expect(baseAssetOfPair("USDT")).toBeNull();
  });
});

describe("mapKrakenBalances", () => {
  it("maps balances with the right decimals and codes", () => {
    const rows = mapKrakenBalances(balance, assets, new Date("2026-06-30T00:00:00.000Z"));
    const byCode = Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.BTC).toBe(1_234_567_800n); // 0.12345678 at 10 dp
    expect(byCode.USD).toBe(15_002_500n); // 1500.2500 at 4 dp
    expect(byCode.SOL).toBe(125_000_000_000n); // 12.5 at 10 dp
    expect(byCode.USDC).toBe(10_000_000_000n); // 100 at 8 dp
  });

  it("describes holdings readably", () => {
    const holdings = describeKrakenHoldings(mapKrakenBalances(balance, assets), assets);
    expect(holdings.find((holding) => holding.assetCode === "USD")).toMatchObject({
      decimals: 4,
      formatted: "1500.25",
    });
  });
});

describe("mapKrakenLedgers", () => {
  it("maps deposits and withdrawals and skips trade legs", () => {
    const movements = mapKrakenLedgers(ledgers.ledger, assets);
    // Two trade legs are skipped; only the deposit and withdrawal remain.
    expect(movements).toHaveLength(2);
    const deposit = movements.find((movement) => movement.externalId === "kraken-ledger-L1");
    const withdrawal = movements.find((movement) => movement.externalId === "kraken-ledger-L2");
    expect(deposit).toMatchObject({ assetCode: "BTC", direction: "in", quantityMinor: 5_000_000_000n });
    expect(withdrawal).toMatchObject({ assetCode: "USD", direction: "out", quantityMinor: 2_500_000n });
    expect(movements.some((movement) => movement.externalId.includes("L3"))).toBe(false);
  });
});

describe("mapKrakenTrades", () => {
  it("maps a buy and a sell to movements on the base asset", () => {
    const movements = mapKrakenTrades(trades.trades, assets);
    const buy = movements.find((movement) => movement.externalId === "kraken-trade-TT1");
    const sell = movements.find((movement) => movement.externalId === "kraken-trade-TT2");
    expect(buy).toMatchObject({ assetCode: "BTC", direction: "in", quantityMinor: 1_234_567_800n });
    expect(sell).toMatchObject({ assetCode: "SOL", direction: "out", quantityMinor: 25_000_000_000n });
  });
});
