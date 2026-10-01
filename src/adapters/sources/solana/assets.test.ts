import { describe, expect, it } from "vitest";
import type { NormalizedBalance } from "../../types";
import { toAssetHoldings } from "./assets";
import { DEFAULT_MINT_REGISTRY } from "./mints";

const balances: NormalizedBalance[] = [
  { assetCode: "SOL", quantityMinor: 1_133_243_493_166_434n, asOf: "2026-10-01T00:00:00.000Z" },
  { assetCode: "USDC", quantityMinor: 817_778_088_916_258n, asOf: "2026-10-01T00:00:00.000Z" },
];

describe("toAssetHoldings", () => {
  it("describes each asset with a name, decimals, and a human amount", () => {
    const holdings = toAssetHoldings(balances, DEFAULT_MINT_REGISTRY);
    expect(holdings).toEqual([
      {
        assetCode: "SOL",
        name: "Solana",
        decimals: 9,
        formatted: "1133243.493166434",
        quantityMinor: 1_133_243_493_166_434n,
        asOf: "2026-10-01T00:00:00.000Z",
      },
      {
        assetCode: "USDC",
        name: "USD Coin",
        decimals: 6,
        formatted: "817778088.916258",
        quantityMinor: 817_778_088_916_258n,
        asOf: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("falls back gracefully for an unregistered code", () => {
    const [holding] = toAssetHoldings([{ assetCode: "XYZ", quantityMinor: 5n, asOf: "2026-10-01T00:00:00.000Z" }]);
    expect(holding).toMatchObject({ assetCode: "XYZ", name: "XYZ", decimals: 0, formatted: "5" });
  });
});
