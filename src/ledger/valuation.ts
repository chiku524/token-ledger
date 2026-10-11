/**
 * Market valuation and staleness. Prices are rational, never binary floats:
 * a price is `priceMinor / 10^quoteScale` of the quote currency per whole asset
 * unit. Valuing a holding multiplies a quantity (its own minor scale) by the
 * price and produces a value in the quote currency's minor units, with half-up
 * rounding — the same convention as FX translation.
 *
 * A price never posts to the journal by itself. This module produces a value
 * for display and for a reviewable revaluation draft.
 *
 * When a native quote (SGD/MYR) is missing but a USD price and an FX rate exist,
 * the USD price is translated into the display currency so Holdings can toggle
 * without waiting for a second CoinGecko quote row.
 */
import { findAppliedRate, translateWithRate, type FxRate } from "./fx";
import type { AssetPrice } from "./pricing";

export type PriceAge = "fresh" | "stale" | "missing";

export interface PricedValue {
  assetCode: string;
  quoteCurrency: string;
  quantityMinor: bigint;
  quantityScale: number;
  priceMinor: bigint;
  quoteScale: number;
  /** Quantity × price, in minor units of the quote currency. */
  valueMinor: bigint;
  asOf: string;
  origin: "example" | "live";
  source: string;
  age: PriceAge;
}

export const DEFAULT_STALENESS_MS = 24 * 60 * 60 * 1000;
const USD = "USD";

/**
 * Pick the price of one whole asset unit on or before `asOf`. A live price wins
 * over an example one at the same instant; otherwise the newest wins.
 */
export function selectAssetPrice(
  prices: readonly AssetPrice[],
  assetCode: string,
  quoteCurrency: string,
  asOf: string,
): AssetPrice | null {
  const at = Date.parse(asOf);
  if (Number.isNaN(at)) throw new Error(`Invalid as-of date "${asOf}".`);
  const candidates = prices.filter(
    (price) =>
      price.assetCode === assetCode &&
      price.quoteCurrency === quoteCurrency &&
      Date.parse(price.asOf) <= at,
  );
  candidates.sort((a, b) => {
    const byTime = Date.parse(b.asOf) - Date.parse(a.asOf);
    if (byTime !== 0) return byTime;
    if (a.origin !== b.origin) return a.origin === "live" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

/**
 * Prefer a native quote-currency price; otherwise convert a USD price with FX.
 * Returns null when neither path is available.
 */
export function selectDisplayPrice(
  prices: readonly AssetPrice[],
  assetCode: string,
  quoteCurrency: string,
  asOf: string,
  rates: readonly FxRate[] = [],
): AssetPrice | null {
  const direct = selectAssetPrice(prices, assetCode, quoteCurrency, asOf);
  if (direct) return direct;
  if (quoteCurrency === USD || rates.length === 0) return null;

  const usd = selectAssetPrice(prices, assetCode, USD, asOf);
  if (!usd) return null;
  const applied = findAppliedRate(rates, USD, quoteCurrency, asOf);
  if (!applied) return null;

  return {
    ...usd,
    id: `${usd.id}_fx_${quoteCurrency}`,
    quoteCurrency,
    priceMinor: translateWithRate(usd.priceMinor, applied, usd.quoteScale),
    source: `${usd.source}+fx`,
  };
}

/** How old a price is at a reference instant, against a staleness threshold. */
export function priceAge(price: Pick<AssetPrice, "asOf">, asOf: string, thresholdMs = DEFAULT_STALENESS_MS): PriceAge {
  const observed = Date.parse(price.asOf);
  const at = Date.parse(asOf);
  if (Number.isNaN(observed) || Number.isNaN(at)) return "missing";
  return at - observed > thresholdMs ? "stale" : "fresh";
}

/**
 * Value one holding. `quantityMinor` is at the asset's scale; the result is in
 * minor units of the quote currency. Returns null when no price is available on
 * or before `asOf`, so a caller can show "unpriced" rather than a silent zero.
 * Optional `rates` enable USD → display-currency conversion when a native quote
 * row is missing.
 */
export function valueHolding(input: {
  prices: readonly AssetPrice[];
  assetCode: string;
  quantityMinor: bigint;
  quantityScale: number;
  quoteCurrency: string;
  asOf: string;
  rates?: readonly FxRate[];
  stalenessMs?: number;
}): PricedValue | null {
  const price = selectDisplayPrice(
    input.prices,
    input.assetCode,
    input.quoteCurrency,
    input.asOf,
    input.rates ?? [],
  );
  if (!price) return null;
  if (!Number.isInteger(input.quantityScale) || input.quantityScale < 0 || input.quantityScale > 36) {
    throw new Error(`Invalid quantity scale ${input.quantityScale}.`);
  }
  // value = quantityMinor * priceMinor / 10^quantityScale, half-up.
  const numerator = input.quantityMinor * price.priceMinor;
  const denominator = 10n ** BigInt(input.quantityScale);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const valueMinor = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return {
    assetCode: input.assetCode,
    quoteCurrency: input.quoteCurrency,
    quantityMinor: input.quantityMinor,
    quantityScale: input.quantityScale,
    priceMinor: price.priceMinor,
    quoteScale: price.quoteScale,
    valueMinor,
    asOf: price.asOf,
    origin: price.origin,
    source: price.source,
    age: priceAge(price, input.asOf, input.stalenessMs),
  };
}

export interface ValuationSummary {
  quoteCurrency: string;
  asOf: string;
  rows: PricedValue[];
  /** Assets held with no price on or before asOf. */
  unpriced: Array<{ assetCode: string; quantityMinor: bigint; quantityScale: number }>;
  totalMinor: bigint;
  /** True when at least one held asset could not be priced or its price is stale. */
  incomplete: boolean;
  stale: boolean;
}

/**
 * Value a set of holdings and total them. An unpriced or stale holding makes
 * the summary `incomplete` (and `stale` when a used price is stale) so a report
 * never presents a stale or partial figure as final.
 */
export function valueHoldings(input: {
  prices: readonly AssetPrice[];
  holdings: readonly { assetCode: string; quantityMinor: bigint; quantityScale: number }[];
  quoteCurrency: string;
  asOf: string;
  rates?: readonly FxRate[];
  stalenessMs?: number;
}): ValuationSummary {
  const rows: PricedValue[] = [];
  const unpriced: ValuationSummary["unpriced"] = [];
  for (const holding of input.holdings) {
    if (holding.quantityMinor === 0n) continue;
    const value = valueHolding({
      prices: input.prices,
      assetCode: holding.assetCode,
      quantityMinor: holding.quantityMinor,
      quantityScale: holding.quantityScale,
      quoteCurrency: input.quoteCurrency,
      asOf: input.asOf,
      rates: input.rates,
      stalenessMs: input.stalenessMs,
    });
    if (value) rows.push(value);
    else unpriced.push(holding);
  }
  const totalMinor = rows.reduce((sum, row) => sum + row.valueMinor, 0n);
  const stale = rows.some((row) => row.age === "stale");
  return {
    quoteCurrency: input.quoteCurrency,
    asOf: input.asOf,
    rows,
    unpriced,
    totalMinor,
    incomplete: unpriced.length > 0 || stale,
    stale,
  };
}
