/**
 * Kraken asset symbols.
 *
 * Kraken returns balances and ledger entries keyed by an internal symbol that
 * is not always the display symbol: `XXBT`, `XETH`, `ZUSD` carry a legacy `X`
 * (crypto) or `Z` (fiat) prefix, while `SOL`, `USDC`, `DAI` do not. The public
 * Assets endpoint maps each key to an `altname`, which is the reliable source.
 *
 * `XBT` is Kraken's ticker for Bitcoin; the ledger stores `BTC`.
 */
import type { KrakenAsset } from "./kraken-responses";

/** Ledger asset code from a Kraken Assets entry. */
export function assetCodeFromEntry(entry: Pick<KrakenAsset, "altname">): string {
  return toLedgerCode(entry.altname ?? "");
}

/** Map a raw balance/ledger key to a ledger code, given the Assets map. */
export function assetCodeForKey(key: string, assets?: Record<string, KrakenAsset>): string {
  const entry = assets?.[key];
  if (entry?.altname) return toLedgerCode(entry.altname);
  return toLedgerCode(stripLegacyPrefix(key));
}

/** Decimals for a ledger asset code, from the Assets map. Defaults to 8. */
export function decimalsForCode(code: string, assets: Record<string, KrakenAsset>): number {
  for (const entry of Object.values(assets)) {
    if (toLedgerCode(entry.altname ?? "") === code) return entry.decimals;
  }
  return 8;
}

function toLedgerCode(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  return upper === "XBT" ? "BTC" : upper;
}

/**
 * Fallback when the Assets map is unavailable: drop a single legacy `X`/`Z`
 * prefix from a 4-character key (`XXBT` -> `XBT`, `ZUSD` -> `USD`) but leave
 * real 4-letter symbols alone (`USDC`, `DASH`).
 */
function stripLegacyPrefix(key: string): string {
  const upper = key.trim().toUpperCase();
  if (upper.length === 4 && (upper.startsWith("X") || upper.startsWith("Z")) && isKnownCurrency(upper.slice(1))) {
    return upper.slice(1);
  }
  return upper;
}

const KNOWN_CURRENCIES = new Set([
  "BTC", "XBT", "ETH", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF",
  "SOL", "POL", "DOT", "ADA", "LINK", "USDT", "USDC", "DAI", "XTZ", "EOS",
]);

function isKnownCurrency(code: string): boolean {
  return KNOWN_CURRENCIES.has(code);
}
