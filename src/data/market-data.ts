/**
 * Refresh stored market prices for the assets an organization actually holds.
 * A live fetch is best-effort: if the source is down or rate-limited the last
 * stored price stays, and staleness handling on the pages makes the age visible.
 * Prices are observations for valuation only; they never post to the journal.
 */
import { booksAreWritable, loadBooksForJob } from "./load-books";
import { HOLDINGS_DISPLAY_CURRENCIES } from "./display-currency";
import { insertAssetPrices, insertFxRate } from "@/db/write";
import { CoinGeckoPriceProvider, type NormalizedPrice } from "@/adapters/market/prices";
import { EcbFxProvider } from "@/adapters/market/fx";
import { findAppliedRate, HOLDINGS_DISPLAY_FX_FALLBACKS, translateWithRate, type FxRate } from "@/ledger";
import type { StoredFxRate } from "./books";

/** CoinGecko quote currencies Holdings can toggle (USD, SGD, MYR). */
function holdingsPriceProvider(provider?: CoinGeckoPriceProvider): CoinGeckoPriceProvider {
  return provider ?? new CoinGeckoPriceProvider({ quoteCurrencies: HOLDINGS_DISPLAY_CURRENCIES });
}

/**
 * When CoinGecko omits a display quote, derive it from USD × FX (saved rates,
 * then built-in Holdings fallbacks) so SGD/MYR rows exist after refresh even if
 * the price API only returned USD and the org never stored USD FX pairs.
 */
export function backfillDisplayQuotes(
  prices: readonly NormalizedPrice[],
  rates: readonly StoredFxRate[] | readonly FxRate[],
  asOf: string,
): NormalizedPrice[] {
  const seen = new Set(prices.map((price) => `${price.assetCode}|${price.quoteCurrency}`));
  const extras: NormalizedPrice[] = [];
  for (const usd of prices.filter((price) => price.quoteCurrency === "USD")) {
    for (const quote of HOLDINGS_DISPLAY_CURRENCIES) {
      if (quote === "USD" || seen.has(`${usd.assetCode}|${quote}`)) continue;
      const applied =
        findAppliedRate(rates as readonly FxRate[], "USD", quote, asOf) ??
        findAppliedRate(HOLDINGS_DISPLAY_FX_FALLBACKS, "USD", quote, asOf);
      if (!applied) continue;
      const viaFallback = applied.rate.id.startsWith("fx_holdings_fallback_");
      extras.push({
        ...usd,
        quoteCurrency: quote,
        priceMinor: translateWithRate(usd.priceMinor, applied, usd.quoteScale),
        source: viaFallback ? `${usd.source}+fx-fallback` : `${usd.source}+fx`,
      });
      seen.add(`${usd.assetCode}|${quote}`);
    }
  }
  return extras.length === 0 ? [...prices] : [...prices, ...extras];
}

export interface MarketRefreshOutcome {
  organizationId: string;
  assets: string[];
  stored: number;
  source: string;
  skipped: boolean;
  message: string;
}

/** The distinct asset codes the organization holds or tracks, uppercased. */
function trackedAssetCodes(books: { assets: readonly { code: string }[]; balanceSnapshots: readonly { assetCode: string }[] }): string[] {
  return [
    ...new Set([
      ...books.assets.map((asset) => asset.code),
      ...books.balanceSnapshots.map((snapshot) => snapshot.assetCode),
    ]),
  ]
    .map((code) => code.toUpperCase())
    .sort();
}

export async function refreshAssetPrices(
  organizationId: string,
  provider?: CoinGeckoPriceProvider,
): Promise<MarketRefreshOutcome> {
  const priceProvider = holdingsPriceProvider(provider);
  const books = await loadBooksForJob(organizationId);
  const held = trackedAssetCodes(books);

  let prices: NormalizedPrice[] = [];
  try {
    prices = await priceProvider.fetchPrices(held);
  } catch (error) {
    return {
      organizationId,
      assets: held,
      stored: 0,
      source: priceProvider.source,
      skipped: true,
      message: error instanceof Error ? error.message : "The price source could not be reached.",
    };
  }

  const asOf = prices[0]?.asOf ?? new Date().toISOString();
  const toStore = backfillDisplayQuotes(prices, books.fxRates, asOf);

  const stored = await insertAssetPrices(
    books,
    toStore.map((price) => ({ ...price, origin: "live" as const })),
    "market data",
  );
  return {
    organizationId,
    assets: held,
    stored,
    source: priceProvider.source,
    skipped: false,
    message: stored > 0 ? `Stored ${stored} price${stored === 1 ? "" : "s"}.` : "No prices were returned.",
  };
}

/** Refresh prices for every organization with a database. */
export async function refreshAllAssetPrices(
  provider?: CoinGeckoPriceProvider,
): Promise<MarketRefreshOutcome[]> {
  if (!booksAreWritable()) return [];
  const { listOrganizationIds } = await import("@/db/read");
  const organizationIds = await listOrganizationIds();
  const outcomes: MarketRefreshOutcome[] = [];
  for (const organizationId of organizationIds) {
    outcomes.push(await refreshAssetPrices(organizationId, provider));
  }
  return outcomes;
}

export interface FxRefreshOutcome {
  organizationId: string;
  pairs: string[];
  stored: number;
  source: string;
  skipped: boolean;
  message: string;
}

/**
 * Refresh live FX rates for entity functional currencies plus Holdings display
 * currencies (USD/SGD/MYR), so a USD CoinGecko price can be converted when a
 * native quote row is missing. Each ordered pair is stored when the source
 * returns it; the inverse is derived at use time via findAppliedRate.
 */
export async function refreshFxRates(
  organizationId: string,
  provider: EcbFxProvider = new EcbFxProvider(),
): Promise<FxRefreshOutcome> {
  const books = await loadBooksForJob(organizationId);
  const currencies = [
    ...new Set([
      ...books.entities.map((entity) => entity.functionalCurrency),
      ...HOLDINGS_DISPLAY_CURRENCIES,
    ]),
  ].sort();
  const pairs: Array<{ base: string; quote: string }> = [];
  for (const base of currencies) {
    for (const quote of currencies) {
      if (base !== quote) pairs.push({ base, quote });
    }
  }

  let rates;
  try {
    rates = await provider.fetchRates(pairs);
  } catch (error) {
    return {
      organizationId,
      pairs: pairs.map((pair) => `${pair.base}->${pair.quote}`),
      stored: 0,
      source: provider.source,
      skipped: true,
      message: error instanceof Error ? error.message : "The FX source could not be reached.",
    };
  }

  let stored = 0;
  for (const rate of rates) {
    await insertFxRate(
      books,
      {
        baseCurrency: rate.baseCurrency,
        quoteCurrency: rate.quoteCurrency,
        numerator: rate.numerator,
        scale: rate.scale,
        asOf: rate.asOf.slice(0, 10),
        note: `Live rate from ${rate.source}. Stored once; the inverse is derived.`,
        origin: "live",
      },
      "market data",
    );
    stored += 1;
  }
  return {
    organizationId,
    pairs: pairs.map((pair) => `${pair.base}->${pair.quote}`),
    stored,
    source: provider.source,
    skipped: false,
    message: stored > 0 ? `Stored ${stored} rate${stored === 1 ? "" : "s"}.` : "No rates were returned.",
  };
}

export async function refreshAllFxRates(provider?: EcbFxProvider): Promise<FxRefreshOutcome[]> {
  if (!booksAreWritable()) return [];
  const { listOrganizationIds } = await import("@/db/read");
  const organizationIds = await listOrganizationIds();
  const outcomes: FxRefreshOutcome[] = [];
  for (const organizationId of organizationIds) {
    outcomes.push(await refreshFxRates(organizationId, provider));
  }
  return outcomes;
}
