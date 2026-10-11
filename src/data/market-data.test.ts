import { describe, expect, it } from "vitest";
import { backfillDisplayQuotes } from "./market-data";

describe("backfillDisplayQuotes", () => {
  it("derives SGD and MYR from USD when CoinGecko omitted them", () => {
    const filled = backfillDisplayQuotes(
      [
        {
          assetCode: "ETH",
          quoteCurrency: "USD",
          priceMinor: 320000n,
          quoteScale: 2,
          asOf: "2026-06-15T00:00:00.000Z",
          source: "coingecko",
        },
      ],
      [
        {
          id: "fx_usd_sgd",
          organizationId: "org_1",
          baseCurrency: "USD",
          quoteCurrency: "SGD",
          numerator: 13500n,
          scale: 4,
          asOf: "2026-06-01",
          origin: "live",
          note: "",
        },
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
      "2026-06-15T00:00:00.000Z",
    );
    expect(filled).toEqual([
      expect.objectContaining({ assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n }),
      expect.objectContaining({ assetCode: "ETH", quoteCurrency: "SGD", priceMinor: 432000n, source: "coingecko+fx" }),
      expect.objectContaining({ assetCode: "ETH", quoteCurrency: "MYR", priceMinor: 1504000n, source: "coingecko+fx" }),
    ]);
  });

  it("does not overwrite a native CoinGecko quote", () => {
    const filled = backfillDisplayQuotes(
      [
        {
          assetCode: "ETH",
          quoteCurrency: "USD",
          priceMinor: 320000n,
          quoteScale: 2,
          asOf: "2026-06-15T00:00:00.000Z",
          source: "coingecko",
        },
        {
          assetCode: "ETH",
          quoteCurrency: "SGD",
          priceMinor: 400000n,
          quoteScale: 2,
          asOf: "2026-06-15T00:00:00.000Z",
          source: "coingecko",
        },
      ],
      [
        {
          id: "fx_usd_sgd",
          organizationId: "org_1",
          baseCurrency: "USD",
          quoteCurrency: "SGD",
          numerator: 13500n,
          scale: 4,
          asOf: "2026-06-01",
          origin: "live",
          note: "",
        },
      ],
      "2026-06-15T00:00:00.000Z",
    );
    expect(filled.filter((price) => price.quoteCurrency === "SGD")).toEqual([
      expect.objectContaining({ priceMinor: 400000n, source: "coingecko" }),
    ]);
  });
});
