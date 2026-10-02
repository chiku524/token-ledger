import { describe, expect, it, vi } from "vitest";
import { EcbFxProvider, FxProviderError } from "./fx";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("EcbFxProvider", () => {
  it("returns rational rates per base, rounding to the rate scale", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("base=MYR")) return jsonResponse({ rates: { SGD: 0.30123, USD: 0.21234 } });
      if (url.includes("base=USD")) return jsonResponse({ rates: { MYR: 4.7 } });
      return jsonResponse({ rates: {} });
    }) as unknown as typeof fetch;
    const provider = new EcbFxProvider({ fetchImpl, now: () => new Date("2026-06-15T00:00:00Z") });
    const rates = await provider.fetchRates([
      { base: "MYR", quote: "SGD" },
      { base: "MYR", quote: "USD" },
      { base: "USD", quote: "MYR" },
      { base: "USD", quote: "USD" },
    ]);
    expect(rates).toEqual([
      { baseCurrency: "MYR", quoteCurrency: "SGD", numerator: 301230n, scale: 6, asOf: "2026-06-15T00:00:00.000Z", source: "exchangerate.host" },
      { baseCurrency: "MYR", quoteCurrency: "USD", numerator: 212340n, scale: 6, asOf: "2026-06-15T00:00:00.000Z", source: "exchangerate.host" },
      { baseCurrency: "USD", quoteCurrency: "MYR", numerator: 4700000n, scale: 6, asOf: "2026-06-15T00:00:00.000Z", source: "exchangerate.host" },
    ]);
  });

  it("skips pairs the source does not return", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rates: {} }));
    const provider = new EcbFxProvider({ fetchImpl });
    expect(await provider.fetchRates([{ base: "MYR", quote: "USD" }])).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const provider = new EcbFxProvider({ fetchImpl });
    await expect(provider.fetchRates([{ base: "MYR", quote: "USD" }])).rejects.toBeInstanceOf(FxProviderError);
  });

  it("makes no request when every pair is the same currency", async () => {
    const fetchImpl = vi.fn();
    const provider = new EcbFxProvider({ fetchImpl });
    expect(await provider.fetchRates([{ base: "USD", quote: "USD" }])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
