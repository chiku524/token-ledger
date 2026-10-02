/**
 * Live asset prices from a public, keyless source (CoinGecko's simple price
 * endpoint). Read-only: it issues GETs and never authenticates with a key. The
 * caller decides the assets and quote currency; this module only fetches and
 * normalises, so it can be tested with an injected fetch.
 *
 * See docs/adr-market-data.md for the source choice and rate limits.
 */
import { toMinorRounded } from "@/ledger";

export class PriceProviderError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, options: { httpStatus?: number | null } = {}) {
    super(message);
    this.name = "PriceProviderError";
    this.httpStatus = options.httpStatus ?? null;
  }
}

/** CoinGecko ids for the assets this product tracks. */
export const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  SOL: "solana",
  POL: "matic-network",
  BTC: "bitcoin",
  SUI: "sui",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

export interface NormalizedPrice {
  assetCode: string;
  quoteCurrency: string;
  /** Price of one whole unit, in minor units of the quote currency. */
  priceMinor: bigint;
  quoteScale: number;
  asOf: string;
  source: string;
}

export interface PriceProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The quote currency to request. Fiat scale is 2. */
  quoteCurrency?: string;
  quoteScale?: number;
  now?: () => Date;
}

const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_TIMEOUT_MS = 15_000;

export class CoinGeckoPriceProvider {
  readonly source = "coingecko";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly quoteCurrency: string;
  private readonly quoteScale: number;
  private readonly now: () => Date;

  constructor(options: PriceProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.quoteCurrency = (options.quoteCurrency ?? "USD").toUpperCase();
    this.quoteScale = options.quoteScale ?? 2;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Fetch prices for the given asset codes. Codes with no known CoinGecko id
   * are skipped (the caller keeps its last stored price). Returns one row per
   * asset that returned a usable price.
   */
  async fetchPrices(assetCodes: readonly string[]): Promise<NormalizedPrice[]> {
    const wanted = assetCodes
      .map((code) => ({ code, id: COINGECKO_IDS[code] }))
      .filter((entry): entry is { code: string; id: string } => Boolean(entry.id));
    if (wanted.length === 0) return [];

    const ids = wanted.map((entry) => entry.id).join(",");
    const vs = this.quoteCurrency.toLowerCase();
    const url = `${this.baseUrl}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new PriceProviderError(`Price request ${reason}.`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new PriceProviderError(`Price source returned HTTP ${response.status}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    const payload = (await response.json()) as Record<string, Record<string, unknown>>;
    const asOf = this.now().toISOString();
    const prices: NormalizedPrice[] = [];
    for (const { code, id } of wanted) {
      const value = payload[id]?.[vs];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      prices.push({
        assetCode: code,
        quoteCurrency: this.quoteCurrency,
        priceMinor: toMinorRounded(value.toFixed(8), this.quoteScale),
        quoteScale: this.quoteScale,
        asOf,
        source: this.source,
      });
    }
    return prices;
  }
}
