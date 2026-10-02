/**
 * Live foreign-exchange rates from a public, keyless source: Frankfurter, which
 * serves the ECB reference rates. Read-only and needs no API key.
 *
 * A rate is stored once per ordered pair, as a rational numerator/scale, and the
 * inverse is derived, never stored twice — the same rule the manual FX form
 * enforces. See docs/adr-market-data.md.
 */
import { toMinorRounded } from "@/ledger";

export class FxProviderError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, options: { httpStatus?: number | null } = {}) {
    super(message);
    this.name = "FxProviderError";
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface NormalizedFxRate {
  baseCurrency: string;
  quoteCurrency: string;
  /** 1 base = numerator / 10^scale quote. */
  numerator: bigint;
  scale: number;
  asOf: string;
  source: string;
}

export interface FxProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_BASE_URL = "https://api.frankfurter.dev/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
/** How many decimal places a fetched rate is rounded to. */
const RATE_SCALE = 6;

/** Frankfurter serves ECB reference rates; a base with no ECB quote (e.g. MYR) is not returned. */
export class EcbFxProvider {
  readonly source = "frankfurter";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options: FxProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Fetch the given ordered currency pairs. Only pairs the source returns are
   * kept; the caller stores each once and derives the inverse.
   */
  async fetchRates(pairs: ReadonlyArray<{ base: string; quote: string }>): Promise<NormalizedFxRate[]> {
    const wanted = pairs
      .map((pair) => ({ base: pair.base.toUpperCase(), quote: pair.quote.toUpperCase() }))
      .filter((pair) => pair.base !== pair.quote);
    if (wanted.length === 0) return [];

    const bases = [...new Set(wanted.map((pair) => pair.base))];
    const rates: NormalizedFxRate[] = [];
    const asOf = this.now().toISOString();
    for (const base of bases) {
      const payload = await this.fetchBase(base);
      const row = payload.rates ?? {};
      for (const pair of wanted.filter((entry) => entry.base === base)) {
        const value = row[pair.quote];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        rates.push({
          baseCurrency: pair.base,
          quoteCurrency: pair.quote,
          numerator: toMinorRounded(value.toFixed(10), RATE_SCALE),
          scale: RATE_SCALE,
          asOf,
          source: this.source,
        });
      }
    }
    return rates;
  }

  private async fetchBase(base: string): Promise<{ rates?: Record<string, unknown> }> {
    const url = `${this.baseUrl}/latest?base=${encodeURIComponent(base)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new FxProviderError(`FX request ${reason}.`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new FxProviderError(`FX source returned HTTP ${response.status}.`, { httpStatus: response.status });
    }
    return (await response.json()) as { rates?: Record<string, unknown> };
  }
}
