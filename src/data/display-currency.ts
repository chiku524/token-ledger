/**
 * Fiat currencies Holdings market value can show. Matches CoinGecko
 * `vs_currencies` (usd, sgd, myr) and the Combined-page `?currency=` pattern.
 */
export const HOLDINGS_DISPLAY_CURRENCIES = ["USD", "SGD", "MYR"] as const;

export type HoldingsDisplayCurrency = (typeof HOLDINGS_DISPLAY_CURRENCIES)[number];

export const DEFAULT_HOLDINGS_DISPLAY_CURRENCY: HoldingsDisplayCurrency = "USD";

export function isHoldingsDisplayCurrency(value: string): value is HoldingsDisplayCurrency {
  return (HOLDINGS_DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/** Resolve `?currency=` (or similar) to a supported Holdings display currency. */
export function resolveHoldingsDisplayCurrency(
  requested: string | undefined,
  fallback: HoldingsDisplayCurrency = DEFAULT_HOLDINGS_DISPLAY_CURRENCY,
): HoldingsDisplayCurrency {
  const code = (requested ?? "").trim().toUpperCase();
  return isHoldingsDisplayCurrency(code) ? code : fallback;
}
