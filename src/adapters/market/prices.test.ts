import { describe, expect, it, vi } from "vitest";
import {
  COINGECKO_IDS,
  CoinbaseSpotPriceProvider,
  CoinGeckoPriceProvider,
  FallbackPriceProvider,
  PriceProviderError,
} from "./prices";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

describe("CoinGeckoPriceProvider", () => {
  it("normalises a response into minor-unit prices and records the source", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ethereum: { usd: 3200.123456 }, solana: { usd: 150 } }));
    const provider = new CoinGeckoPriceProvider({ fetchImpl, now: () => new Date("2026-06-15T00:00:00Z") });
    const prices = await provider.fetchPrices(["ETH", "SOL"]);
    expect(prices).toEqual([
      { assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320012n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "SOL", quoteCurrency: "USD", priceMinor: 15000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
    ]);
  });

  it("requests and stores USD, SGD, and MYR in one call", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("vs_currencies=usd%2Csgd%2Cmyr");
      return jsonResponse({
        ethereum: { usd: 3200, sgd: 4320, myr: 15040 },
        solana: { usd: 150, sgd: 202.5, myr: 705 },
      });
    });
    const provider = new CoinGeckoPriceProvider({
      fetchImpl,
      quoteCurrencies: ["USD", "SGD", "MYR"],
      now: () => new Date("2026-06-15T00:00:00Z"),
    });
    const prices = await provider.fetchPrices(["ETH", "SOL"]);
    expect(prices).toEqual([
      { assetCode: "ETH", quoteCurrency: "USD", priceMinor: 320000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "ETH", quoteCurrency: "SGD", priceMinor: 432000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "ETH", quoteCurrency: "MYR", priceMinor: 1504000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "SOL", quoteCurrency: "USD", priceMinor: 15000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "SOL", quoteCurrency: "SGD", priceMinor: 20250n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
      { assetCode: "SOL", quoteCurrency: "MYR", priceMinor: 70500n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coingecko" },
    ]);
  });

  it("skips unknown codes and missing or non-positive values", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ethereum: { usd: 0 }, solana: { usd: 150 } }));
    const provider = new CoinGeckoPriceProvider({ fetchImpl });
    const prices = await provider.fetchPrices(["DOGE", "ETH", "SOL"]);
    expect(prices.map((price) => price.assetCode)).toEqual(["SOL"]);
  });

  it("does not call the network when no requested code has a known id", async () => {
    const fetchImpl = vi.fn();
    const provider = new CoinGeckoPriceProvider({ fetchImpl });
    expect(await provider.fetchPrices(["DOGE"])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws a ProviderError on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 429 }));
    const provider = new CoinGeckoPriceProvider({ fetchImpl });
    await expect(provider.fetchPrices(["ETH"])).rejects.toBeInstanceOf(PriceProviderError);
  });
});

describe("POL id", () => {
  it("maps POL to the current Polygon token, not the legacy MATIC listing", () => {
    expect(COINGECKO_IDS.POL).toBe("polygon-ecosystem-token");
  });
});

describe("CoinbaseSpotPriceProvider", () => {
  it("fetches USD spot prices per asset and records coinbase as the source", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse({ data: { amount: "101.535", base: "SOL", currency: "USD" } });
    });
    const provider = new CoinbaseSpotPriceProvider({ fetchImpl, now: () => new Date("2026-06-15T00:00:00Z") });
    const prices = await provider.fetchPrices(["SOL", "DOGE"]);
    expect(urls).toEqual(["https://api.coinbase.com/v2/prices/SOL-USD/spot"]);
    expect(prices).toEqual([
      { assetCode: "SOL", quoteCurrency: "USD", priceMinor: 10154n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coinbase" },
    ]);
  });

  it("skips assets that error or return junk instead of throwing", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("ETH-USD") ? jsonResponse({}, { status: 404 }) : jsonResponse({ data: { amount: "not-a-number" } }),
    );
    const provider = new CoinbaseSpotPriceProvider({ fetchImpl });
    expect(await provider.fetchPrices(["ETH", "SOL"])).toEqual([]);
  });
});

describe("FallbackPriceProvider", () => {
  const now = () => new Date("2026-06-15T00:00:00Z");

  it("falls back to Coinbase when CoinGecko is rate limited", async () => {
    const coingecko = new CoinGeckoPriceProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { status: 429 })), now });
    const coinbase = new CoinbaseSpotPriceProvider({
      fetchImpl: vi.fn(async () => jsonResponse({ data: { amount: "150" } })),
      now,
    });
    const prices = await new FallbackPriceProvider(coingecko, coinbase).fetchPrices(["SOL"]);
    expect(prices).toEqual([
      { assetCode: "SOL", quoteCurrency: "USD", priceMinor: 15000n, quoteScale: 2, asOf: "2026-06-15T00:00:00.000Z", source: "coinbase" },
    ]);
  });

  it("only asks the fallback for assets CoinGecko did not price", async () => {
    const coingecko = new CoinGeckoPriceProvider({
      fetchImpl: vi.fn(async () => jsonResponse({ ethereum: { usd: 3200 } })),
      now,
    });
    const coinbaseFetch = vi.fn(async () => jsonResponse({ data: { amount: "150" } }));
    const coinbase = new CoinbaseSpotPriceProvider({ fetchImpl: coinbaseFetch, now });
    const prices = await new FallbackPriceProvider(coingecko, coinbase).fetchPrices(["ETH", "SOL"]);
    expect(prices.map((price) => `${price.assetCode}:${price.source}`)).toEqual(["ETH:coingecko", "SOL:coinbase"]);
    expect(coinbaseFetch).toHaveBeenCalledTimes(1);
  });

  it("rethrows the primary error when neither source prices anything", async () => {
    const coingecko = new CoinGeckoPriceProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { status: 429 })) });
    const coinbase = new CoinbaseSpotPriceProvider({ fetchImpl: vi.fn(async () => jsonResponse({}, { status: 500 })) });
    await expect(new FallbackPriceProvider(coingecko, coinbase).fetchPrices(["SOL"])).rejects.toBeInstanceOf(PriceProviderError);
  });
});
