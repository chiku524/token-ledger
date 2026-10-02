import { describe, expect, it } from "vitest";
import type { AssetPrice } from "./pricing";
import { priceAge, selectAssetPrice, valueHolding, valueHoldings } from "./valuation";

function price(overrides: Partial<AssetPrice> & Pick<AssetPrice, "assetCode" | "priceMinor" | "asOf">): AssetPrice {
  return {
    id: `price_${overrides.assetCode}_${overrides.asOf}`,
    organizationId: "org_1",
    quoteCurrency: "USD",
    quoteScale: 2,
    origin: "live",
    source: "coingecko",
    ...overrides,
  };
}

describe("selectAssetPrice", () => {
  const prices = [
    price({ assetCode: "ETH", priceMinor: 300000n, asOf: "2026-05-01T00:00:00Z" }),
    price({ assetCode: "ETH", priceMinor: 320000n, asOf: "2026-06-01T00:00:00Z" }),
  ];

  it("picks the newest price on or before the reference time", () => {
    expect(selectAssetPrice(prices, "ETH", "USD", "2026-06-15T00:00:00Z")?.priceMinor).toBe(320000n);
    expect(selectAssetPrice(prices, "ETH", "USD", "2026-05-15T00:00:00Z")?.priceMinor).toBe(300000n);
  });

  it("returns null when no price is old enough to use", () => {
    expect(selectAssetPrice(prices, "ETH", "USD", "2026-04-01T00:00:00Z")).toBeNull();
    expect(selectAssetPrice(prices, "SOL", "USD", "2026-06-15T00:00:00Z")).toBeNull();
  });

  it("prefers a live price over an example one at the same instant", () => {
    const same = [
      price({ assetCode: "ETH", priceMinor: 1n, asOf: "2026-06-01T00:00:00Z", origin: "example", source: "example" }),
      price({ assetCode: "ETH", priceMinor: 2n, asOf: "2026-06-01T00:00:00Z", origin: "live", source: "coingecko" }),
    ];
    expect(selectAssetPrice(same, "ETH", "USD", "2026-06-15T00:00:00Z")?.priceMinor).toBe(2n);
  });
});

describe("priceAge", () => {
  const now = "2026-06-15T00:00:00Z";
  it("is fresh inside the threshold and stale outside it", () => {
    expect(priceAge({ asOf: "2026-06-14T12:00:00Z" }, now)).toBe("fresh");
    expect(priceAge({ asOf: "2026-06-10T00:00:00Z" }, now)).toBe("stale");
  });
});

describe("valueHolding", () => {
  const prices = [price({ assetCode: "ETH", priceMinor: 320000n, asOf: "2026-06-01T00:00:00Z" })];

  it("multiplies quantity by price with half-up rounding", () => {
    // 2.5 ETH = 2_500000000000000000 minor (18dp); price 3200.00 USD.
    const value = valueHolding({
      prices,
      assetCode: "ETH",
      quantityMinor: 2_500000000000000000n,
      quantityScale: 18,
      quoteCurrency: "USD",
      asOf: "2026-06-15T00:00:00Z",
    });
    // 2.5 * 3200.00 = 8000.00 USD = 800000 minor.
    expect(value?.valueMinor).toBe(800000n);
    expect(value?.priceMinor).toBe(320000n);
    // The price is 14 days before the as-of, so the default 24h threshold marks it stale.
    expect(value?.age).toBe("stale");
  });

  it("is null with no usable price", () => {
    expect(
      valueHolding({
        prices,
        assetCode: "SOL",
        quantityMinor: 1n,
        quantityScale: 9,
        quoteCurrency: "USD",
        asOf: "2026-06-15T00:00:00Z",
      }),
    ).toBeNull();
  });
});

describe("valueHoldings", () => {
  const prices = [
    price({ assetCode: "ETH", priceMinor: 320000n, asOf: "2026-06-14T00:00:00Z" }),
    price({ assetCode: "USDC", priceMinor: 100n, asOf: "2026-06-14T00:00:00Z" }),
  ];

  it("totals priced holdings and flags unpriced ones as incomplete", () => {
    const summary = valueHoldings({
      prices,
      holdings: [
        { assetCode: "ETH", quantityMinor: 1_000000000000000000n, quantityScale: 18 },
        { assetCode: "USDC", quantityMinor: 5_000000n, quantityScale: 6 },
        { assetCode: "SOL", quantityMinor: 1_000000000n, quantityScale: 9 },
      ],
      quoteCurrency: "USD",
      asOf: "2026-06-15T00:00:00Z",
    });
    // 1 ETH = 3200.00 + 5 USDC = 5.00 => 320500 minor.
    expect(summary.totalMinor).toBe(320500n);
    expect(summary.unpriced.map((row) => row.assetCode)).toEqual(["SOL"]);
    expect(summary.incomplete).toBe(true);
    expect(summary.stale).toBe(false);
  });

  it("flags stale prices and ignores zero holdings", () => {
    const summary = valueHoldings({
      prices,
      holdings: [
        { assetCode: "ETH", quantityMinor: 0n, quantityScale: 18 },
        { assetCode: "USDC", quantityMinor: 1_000000n, quantityScale: 6 },
      ],
      quoteCurrency: "USD",
      asOf: "2026-06-20T00:00:00Z",
      stalenessMs: 24 * 60 * 60 * 1000,
    });
    expect(summary.rows.map((row) => row.assetCode)).toEqual(["USDC"]);
    expect(summary.stale).toBe(true);
    expect(summary.incomplete).toBe(true);
  });
});
