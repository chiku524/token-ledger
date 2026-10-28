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
  // `matic-network` is the legacy MATIC listing and returns a stale, different price.
  POL: "polygon-ecosystem-token",
  MON: "monad",
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
  /**
   * Quote currencies to request in one CoinGecko call (`vs_currencies`).
   * Prefer this when Holdings can toggle USD / SGD / MYR. Falls back to
   * `quoteCurrency` (default USD) when omitted.
   */
  quoteCurrencies?: readonly string[];
  /** Single quote currency. Used when `quoteCurrencies` is omitted. Fiat scale is 2. */
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
  /** First requested quote currency (kept for callers that inspect a single code). */
  readonly quoteCurrency: string;
  private readonly quoteCurrencies: readonly string[];
  private readonly quoteScale: number;
  private readonly now: () => Date;

  constructor(options: PriceProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const currencies = (options.quoteCurrencies?.length
      ? options.quoteCurrencies
      : [options.quoteCurrency ?? "USD"]
    ).map((code) => code.toUpperCase());
    this.quoteCurrencies = [...new Set(currencies)];
    this.quoteCurrency = this.quoteCurrencies[0] ?? "USD";
    this.quoteScale = options.quoteScale ?? 2;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Fetch prices for the given asset codes. Codes with no known CoinGecko id
   * are skipped (the caller keeps its last stored price). Returns one row per
   * asset × quote currency that returned a usable price.
   */
  async fetchPrices(assetCodes: readonly string[]): Promise<NormalizedPrice[]> {
    const wanted = assetCodes
      .map((code) => ({ code, id: COINGECKO_IDS[code] }))
      .filter((entry): entry is { code: string; id: string } => Boolean(entry.id));
    if (wanted.length === 0) return [];

    const ids = wanted.map((entry) => entry.id).join(",");
    const vsList = this.quoteCurrencies.map((code) => code.toLowerCase());
    const url = `${this.baseUrl}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vsList.join(","))}`;

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
      for (const quoteCurrency of this.quoteCurrencies) {
        const value = payload[id]?.[quoteCurrency.toLowerCase()];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        prices.push({
          assetCode: code,
          quoteCurrency,
          priceMinor: toMinorRounded(value.toFixed(8), this.quoteScale),
          quoteScale: this.quoteScale,
          asOf,
          source: this.source,
        });
      }
    }
    return prices;
  }
}

/** The minimal surface `refreshAssetPrices` needs, so providers can be composed or faked. */
export interface PriceProvider {
  readonly source: string;
  fetchPrices(assetCodes: readonly string[]): Promise<NormalizedPrice[]>;
}

export interface CoinbaseSpotOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

/**
 * Keyless USD spot prices from Coinbase's public price endpoint. Used only as a
 * fallback when CoinGecko is rate-limited, down, or omits an asset: CoinGecko's
 * keyless tier is throttled hard for shared cloud IPs, and one failed refresh
 * would otherwise leave Holdings stuck on "No price". Read-only GETs, USD only
 * (SGD and MYR are derived from USD with FX by the caller).
 */
export class CoinbaseSpotPriceProvider implements PriceProvider {
  readonly source = "coinbase";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options: CoinbaseSpotOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.coinbase.com/v2").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  async fetchPrices(assetCodes: readonly string[]): Promise<NormalizedPrice[]> {
    const codes = [...new Set(assetCodes.filter((code) => code in COINGECKO_IDS))];
    const asOf = this.now().toISOString();
    const settled = await Promise.all(codes.map((code) => this.fetchOne(code, asOf)));
    return settled.flatMap((price) => (price ? [price] : []));
  }

  private async fetchOne(code: string, asOf: string): Promise<NormalizedPrice | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/prices/${encodeURIComponent(code)}-USD/spot`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: { amount?: unknown } };
      const value = Number(payload.data?.amount);
      if (!Number.isFinite(value) || value <= 0) return null;
      const priceMinor = toMinorRounded(value.toFixed(8), 2);
      if (priceMinor <= 0n) return null;
      return { assetCode: code, quoteCurrency: "USD", priceMinor, quoteScale: 2, asOf, source: this.source };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Try the primary provider, then fill anything it failed to price from the
 * fallback. Throws the primary's error only when neither source priced anything,
 * so a CoinGecko outage degrades to Coinbase instead of leaving holdings unpriced.
 */
export class FallbackPriceProvider implements PriceProvider {
  constructor(
    private readonly primary: PriceProvider,
    private readonly fallback: PriceProvider,
  ) {}

  get source(): string {
    return this.primary.source;
  }

  async fetchPrices(assetCodes: readonly string[]): Promise<NormalizedPrice[]> {
    let primaryPrices: NormalizedPrice[] = [];
    let primaryError: unknown = null;
    try {
      primaryPrices = await this.primary.fetchPrices(assetCodes);
    } catch (error) {
      primaryError = error;
    }
    const priced = new Set(primaryPrices.filter((price) => price.quoteCurrency === "USD").map((price) => price.assetCode));
    const missing = assetCodes.filter((code) => !priced.has(code));
    let fallbackPrices: NormalizedPrice[] = [];
    if (missing.length > 0) {
      try {
        fallbackPrices = await this.fallback.fetchPrices(missing);
      } catch {
        fallbackPrices = [];
      }
    }
    if (primaryError && primaryPrices.length === 0 && fallbackPrices.length === 0) throw primaryError;
    return [...primaryPrices, ...fallbackPrices];
  }
}