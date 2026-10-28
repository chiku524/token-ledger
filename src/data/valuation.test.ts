import { describe, expect, it } from "vitest";
import type { BooksBalanceSnapshot, StoredAssetPrice } from "./books";
import { holdingsFromSnapshots, latestSnapshots, valueBooksHoldings, valueObservedSnapshot } from "./valuation";

function snapshot(overrides: Partial<BooksBalanceSnapshot> & Pick<BooksBalanceSnapshot, "sourceId" | "assetCode" | "quantityMinor" | "asOf">): BooksBalanceSnapshot {
  return {
    id: `snap_${overrides.sourceId}_${overrides.assetCode}_${overrides.asOf}`,
    organizationId: "org_1",
    entityId: "ent_1",
    ...overrides,
  };
}

describe("holdingsFromSnapshots", () => {
  it("takes the latest observation per source and sums across sources", () => {
    const holdings = holdingsFromSnapshots([
      snapshot({ sourceId: "s1", assetCode: "ETH", quantityMinor: 1n, asOf: "2026-06-01T00:00:00Z" }),
      snapshot({ sourceId: "s1", assetCode: "ETH", quantityMinor: 2n, asOf: "2026-06-05T00:00:00Z" }),
      snapshot({ sourceId: "s2", assetCode: "ETH", quantityMinor: 3n, asOf: "2026-06-02T00:00:00Z" }),
    ]);
    // latest for s1 is 2, plus s2's 3 => 5
    expect(holdings).toEqual([{ assetCode: "ETH", quantityMinor: 5n }]);
  });
});

describe("latestSnapshots", () => {
  it("keeps one snapshot per source and asset, the most recent", () => {
    const latest = latestSnapshots([
      snapshot({ sourceId: "s1", assetCode: "ETH", quantityMinor: 1n, asOf: "2026-06-01T00:00:00Z" }),
      snapshot({ sourceId: "s1", assetCode: "ETH", quantityMinor: 2n, asOf: "2026-06-05T00:00:00Z" }),
      snapshot({ sourceId: "s1", assetCode: "SOL", quantityMinor: 7n, asOf: "2026-06-03T00:00:00Z" }),
      snapshot({ sourceId: "s2", assetCode: "ETH", quantityMinor: 3n, asOf: "2026-06-02T00:00:00Z" }),
    ]);
    expect(latest.map((s) => `${s.sourceId}|${s.assetCode}|${s.quantityMinor}`).sort()).toEqual([
      "s1|ETH|2",
      "s1|SOL|7",
      "s2|ETH|3",
    ]);
  });
});

describe("valueBooksHoldings", () => {
  const prices: StoredAssetPrice[] = [
    { id: "p_eth", organizationId: "org_1", assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n, quoteScale: 2, asOf: "2026-06-14T00:00:00Z", origin: "live", source: "coingecko" },
  ];

  it("values holdings in the quote currency and flags unpriced assets", () => {
    const summary = valueBooksHoldings({
      snapshots: [
        snapshot({ sourceId: "s1", assetCode: "ETH", quantityMinor: 1_000000000000000000n, asOf: "2026-06-14T00:00:00Z" }),
        snapshot({ sourceId: "s1", assetCode: "SOL", quantityMinor: 2_000000000n, asOf: "2026-06-14T00:00:00Z" }),
      ],
      prices,
      assets: [
        { code: "ETH", decimals: 18 },
        { code: "SOL", decimals: 9 },
      ],
      quoteCurrency: "USD",
      asOf: "2026-06-14T12:00:00Z",
    });
    expect(summary.rows.map((row) => row.assetCode)).toEqual(["ETH"]);
    expect(summary.totalMinor).toBe(320000n);
    expect(summary.unpriced.map((row) => row.assetCode)).toEqual(["SOL"]);
    expect(summary.incomplete).toBe(true);
    expect(summary.stale).toBe(false);
  });
});

describe("valueObservedSnapshot", () => {
  it("prices one venue row in the selected quote currency", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "ETH", quantityMinor: 500000000000000000n },
      prices: [
        { id: "p_eth_usd", organizationId: "org_1", assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n, quoteScale: 2, asOf: "2026-06-14T00:00:00Z", origin: "live", source: "coingecko" },
        { id: "p_eth_sgd", organizationId: "org_1", assetCode: "ETH", quoteCurrency: "SGD", priceMinor: 432000n, quoteScale: 2, asOf: "2026-06-14T00:00:00Z", origin: "live", source: "coingecko" },
      ],
      assets: [{ code: "ETH", decimals: 18 }],
      quoteCurrency: "SGD",
      asOf: "2026-06-14T12:00:00Z",
    });
    expect(priced).toMatchObject({ quoteCurrency: "SGD", valueMinor: 216000n });
  });

  it("returns null when there is no USD price to convert from", () => {
    expect(
      valueObservedSnapshot({
        snapshot: { assetCode: "ETH", quantityMinor: 1n },
        prices: [],
        assets: [{ code: "ETH", decimals: 18 }],
        quoteCurrency: "MYR",
        asOf: "2026-06-14T12:00:00Z",
      }),
    ).toBeNull();
  });

  it("converts USD via FX when the native quote row is missing", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "ETH", quantityMinor: 1_000000000000000000n },
      prices: [
        { id: "p_eth", organizationId: "org_1", assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n, quoteScale: 2, asOf: "2026-06-14T00:00:00Z", origin: "live", source: "coingecko" },
      ],
      rates: [
        {
          id: "fx_usd_myr",
          organizationId: "org_1",
          baseCurrency: "USD",
          quoteCurrency: "MYR",
          numerator: 47000n,
          scale: 4,
          asOf: "2026-06-01",
          origin: "live",
          note: "",
        },
      ],
      assets: [{ code: "ETH", decimals: 18 }],
      quoteCurrency: "MYR",
      asOf: "2026-06-14T12:00:00Z",
    });
    expect(priced).toMatchObject({ quoteCurrency: "MYR", valueMinor: 1504000n, source: "coingecko+fx" });
  });

  it("prices SGD for old Harbourline shape (USD prices, MYR→SGD only) via fallbacks", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "SOL", quantityMinor: 100_000000000n },
      prices: [
        { id: "p_sol", organizationId: "org_harbourline", assetCode: "SOL", quoteCurrency: "USD", priceMinor: 15000n, quoteScale: 2, asOf: "2026-06-30T00:00:00.000Z", origin: "example", source: "example" },
      ],
      rates: [
        {
          id: "fx_example_myr_sgd",
          organizationId: "org_harbourline",
          baseCurrency: "MYR",
          quoteCurrency: "SGD",
          numerator: 3000n,
          scale: 4,
          asOf: "2026-04-01",
          origin: "example",
          note: "",
        },
      ],
      assets: [{ code: "SOL", decimals: 9 }],
      quoteCurrency: "SGD",
      asOf: "2026-10-11T12:00:00Z",
    });
    // 100 SOL * 150.00 USD * 1.35 = 20,250.00 SGD
    expect(priced).toMatchObject({ quoteCurrency: "SGD", valueMinor: 2025000n, source: "example+fx-fallback" });
  });
});

describe("valueObservedSnapshot zero and tiny balances", () => {
  const solPrice: StoredAssetPrice = {
    id: "p_sol_usd",
    organizationId: "org_1",
    assetCode: "SOL",
    quoteCurrency: "USD",
    priceMinor: 10150n,
    quoteScale: 2,
    asOf: "2026-06-14T00:00:00Z",
    origin: "live",
    source: "coingecko",
  };
  const assets = [
    { code: "SOL", decimals: 9 },
    { code: "ETH", decimals: 18 },
  ];

  it("values a zero balance at 0 instead of leaving it unpriced", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "SOL", quantityMinor: 0n },
      prices: [solPrice],
      assets,
      quoteCurrency: "SGD",
      asOf: "2026-06-14T12:00:00Z",
    });
    expect(priced).not.toBeNull();
    expect(priced?.valueMinor).toBe(0n);
    expect(priced?.quoteCurrency).toBe("SGD");
  });

  it("values a zero balance at 0 even when the asset has no price at all", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "ETH", quantityMinor: 0n },
      prices: [],
      assets,
      quoteCurrency: "USD",
      asOf: "2026-06-14T12:00:00Z",
    });
    expect(priced?.valueMinor).toBe(0n);
    expect(priced?.quoteCurrency).toBe("USD");
  });

  it("still reports a non-zero balance with no price as unpriced", () => {
    expect(
      valueObservedSnapshot({
        snapshot: { assetCode: "ETH", quantityMinor: 1n },
        prices: [],
        assets,
        quoteCurrency: "USD",
        asOf: "2026-06-14T12:00:00Z",
      }),
    ).toBeNull();
  });

  it("prices a dust SOL balance (0.000295453 SOL) from a stored USD price", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "SOL", quantityMinor: 295453n },
      prices: [solPrice],
      assets,
      quoteCurrency: "USD",
      asOf: "2026-06-14T12:00:00Z",
    });
    // 0.000295453 * 101.50 = 0.02998 -> USD 0.03
    expect(priced?.valueMinor).toBe(3n);
  });

  it("converts a USD price into SGD with the built-in display rate when no SGD price or FX is stored", () => {
    const priced = valueObservedSnapshot({
      snapshot: { assetCode: "SOL", quantityMinor: 1_000000000n },
      prices: [solPrice],
      assets,
      quoteCurrency: "SGD",
      asOf: "2026-06-14T12:00:00Z",
      rates: [],
    });
    // 1 SOL = 101.50 USD * 1.35 = 137.025 -> 137.03 (half-up)
    expect(priced?.valueMinor).toBe(13703n);
    expect(priced?.source).toBe("coingecko+fx-fallback");
  });
});
