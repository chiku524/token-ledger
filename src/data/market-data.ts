/**
 * Refresh stored market prices for the assets an organization actually holds.
 * A live fetch is best-effort: if the source is down or rate-limited the last
 * stored price stays, and staleness handling on the pages makes the age visible.
 * Prices are observations for valuation only; they never post to the journal.
 */
import { booksAreWritable, loadBooks } from "./load-books";
import { insertAssetPrices, insertFxRate } from "@/db/write";
import { CoinGeckoPriceProvider, type NormalizedPrice } from "@/adapters/market/prices";
import { EcbFxProvider } from "@/adapters/market/fx";

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
  provider: CoinGeckoPriceProvider = new CoinGeckoPriceProvider(),
): Promise<MarketRefreshOutcome> {
  const books = await loadBooks(organizationId);
  const held = trackedAssetCodes(books);

  let prices: NormalizedPrice[] = [];
  try {
    prices = await provider.fetchPrices(held);
  } catch (error) {
    return {
      organizationId,
      assets: held,
      stored: 0,
      source: provider.source,
      skipped: true,
      message: error instanceof Error ? error.message : "The price source could not be reached.",
    };
  }

  const stored = await insertAssetPrices(
    books,
    prices.map((price) => ({ ...price, origin: "live" as const })),
    "market data",
  );
  return {
    organizationId,
    assets: held,
    stored,
    source: provider.source,
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
 * Refresh live FX rates for an organization's presentation currencies. Each
 * ordered pair is stored once (origin live); the inverse is derived, never
 * stored twice, matching the manual FX form.
 */
export async function refreshFxRates(
  organizationId: string,
  provider: EcbFxProvider = new EcbFxProvider(),
): Promise<FxRefreshOutcome> {
  const books = await loadBooks(organizationId);
  const currencies = [...new Set(books.entities.map((entity) => entity.functionalCurrency))].sort();
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
