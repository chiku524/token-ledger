import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isValidSuiAddress, normalizeSuiAddress } from "./address";
import { mapSuiBalances, mapSuiTransactions } from "./map";
import type { SuiCoinBalance, SuiQueryResult } from "./sui-responses";

const WATCHED = "0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3";
const observedAt = new Date("2026-06-30T00:00:00.000Z");

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const balances = fixture<{ result: SuiCoinBalance[] }>("balances.json").result;
const blocks = fixture<{ result: SuiQueryResult }>("transactions.json").result;

describe("Sui address", () => {
  it("accepts hex object ids and normalizes to 64 chars", () => {
    expect(isValidSuiAddress(WATCHED)).toBe(true);
    expect(normalizeSuiAddress("0x2")).toBe(`0x${"0".repeat(63)}2`);
    expect(normalizeSuiAddress(`0x${WATCHED.slice(2).toUpperCase()}`)).toBe(WATCHED);
  });

  it("rejects non-hex and non-strings", () => {
    expect(isValidSuiAddress("not an address")).toBe(false);
    expect(isValidSuiAddress("0xzz")).toBe(false);
    expect(isValidSuiAddress(undefined)).toBe(false);
  });
});

describe("mapSuiBalances", () => {
  it("maps registered coin types and skips unknown ones", () => {
    const rows = mapSuiBalances(balances, observedAt);
    const byCode = Object.fromEntries(rows.map((row) => [row.assetCode, row.quantityMinor]));
    expect(byCode.SUI).toBeGreaterThan(0n);
    expect(byCode.USDC).toBe(280009854n);
    // The fixture includes an unregistered btc::BTC coin that must be skipped.
    expect(Object.keys(byCode).sort()).toEqual(["SUI", "USDC"]);
    expect(rows.every((row) => row.asOf === observedAt.toISOString())).toBe(true);
  });

  it("always observes native SUI, even at zero", () => {
    expect(mapSuiBalances([], observedAt)).toEqual([
      { assetCode: "SUI", quantityMinor: 0n, asOf: observedAt.toISOString() },
    ]);
  });
});

describe("mapSuiTransactions", () => {
  it("turns balance changes into net movements and skips zero nets", () => {
    const movements = mapSuiTransactions(blocks.data, WATCHED);
    expect(movements.length).toBeGreaterThan(0);
    for (const movement of movements) {
      expect(movement.chain).toBe("sui");
      expect(movement.assetCode).toBe("SUI");
      expect(movement.quantityMinor).toBeGreaterThan(0n);
      expect(movement.externalId).toMatch(/:SUI$/);
    }
  });

  it("ignores blocks that do not involve the watched address", () => {
    expect(mapSuiTransactions(blocks.data, `0x${"1".repeat(64)}`)).toEqual([]);
  });
});
