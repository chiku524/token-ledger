import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evmChain } from "./chains";
import type { AssetTransfersResult, TokenBalancesResult } from "./evm-responses";
import { describeEvmHoldings, mapEvmBalances } from "./map-balances";
import { mapTransfers } from "./map-transfers";

const ethereum = evmChain("ethereum")!;
const WATCHED = "0x28C6c06298d514Db089934071355E5743bf21d60";
const observedAt = new Date("2026-06-30T00:00:00.000Z");

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const nativeHex = fixture<{ result: string }>("balance.json").result;
const tokens = fixture<{ result: TokenBalancesResult }>("token-balances.json").result;
const transfers = fixture<{ result: AssetTransfersResult }>("transfers.json").result;

describe("mapEvmBalances", () => {
  it("reads native plus registered ERC-20 balances and skips unknown tokens", () => {
    const balances = mapEvmBalances(ethereum, nativeHex, tokens, observedAt);
    const byCode = Object.fromEntries(balances.map((row) => [row.assetCode, row.quantityMinor]));
    // Known registry tokens from the fixture.
    expect(byCode.USDC).toBe(51_951_297_920n);
    expect(byCode.DAI).toBeGreaterThan(0n);
    expect(byCode.WETH).toBeGreaterThan(0n);
    expect(byCode.USDT).toBeGreaterThan(0n);
    expect(byCode.ETH).toBeGreaterThan(0n);
    // The fixture includes one unregistered contract (0x0000...b376) that must be skipped.
    expect(Object.keys(byCode)).not.toContain("UNKNOWN");
    expect(balances.every((row) => row.asOf === observedAt.toISOString())).toBe(true);
  });

  it("works with native only when enhanced methods are unavailable", () => {
    const balances = mapEvmBalances(ethereum, "0x0", null, observedAt);
    expect(balances).toEqual([{ assetCode: "ETH", quantityMinor: 0n, asOf: observedAt.toISOString() }]);
  });

  it("describes holdings with names and decimals", () => {
    const holdings = describeEvmHoldings(ethereum, mapEvmBalances(ethereum, nativeHex, tokens, observedAt));
    const usdc = holdings.find((holding) => holding.assetCode === "USDC");
    expect(usdc).toMatchObject({ name: "USD Coin", decimals: 6, formatted: "51951.29792" });
    expect(holdings.find((holding) => holding.assetCode === "ETH")?.name).toBe("Ethereum");
  });
});

describe("mapTransfers", () => {
  it("maps outgoing native and ERC-20 transfers for the watched address", () => {
    const movements = mapTransfers(ethereum, transfers.transfers, WATCHED);
    expect(movements.length).toBeGreaterThan(0);
    for (const movement of movements) {
      expect(movement.direction).toBe("out");
      expect(movement.chain).toBe("ethereum");
      expect(movement.externalId).toMatch(/:(log|external|internal):/);
      expect(movement.occurredOn).toBe("2026-10-01");
    }
    const codes = movements.map((movement) => movement.assetCode);
    expect(codes).toContain("USDT");
  });

  it("ignores transfers that do not involve the watched address", () => {
    expect(mapTransfers(ethereum, transfers.transfers, "0x0000000000000000000000000000000000000001")).toEqual([]);
  });
});
