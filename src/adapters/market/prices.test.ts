import { describe, expect, it, vi } from "vitest";
import { CoinGeckoPriceProvider, PriceProviderError } from "./prices";

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
