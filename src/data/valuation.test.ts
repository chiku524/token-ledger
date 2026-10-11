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

  it("returns null when there is no price in that currency", () => {
    expect(
      valueObservedSnapshot({
        snapshot: { assetCode: "ETH", quantityMinor: 1n },
        prices: [
          { id: "p_eth", organizationId: "org_1", assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n, quoteScale: 2, asOf: "2026-06-14T00:00:00Z", origin: "live", source: "coingecko" },
        ],
        assets: [{ code: "ETH", decimals: 18 }],
        quoteCurrency: "MYR",
        asOf: "2026-06-14T12:00:00Z",
      }),
    ).toBeNull();
  });
});
