/**
 * Amount handling shared by every exchange connector. Exchanges report balances
 * and movements as decimal strings in major units; the ledger stores bigint
 * minor units, so convert exactly and never through a float.
 */

/** A sensible default when a venue does not report decimals. */
export const DEFAULT_DECIMALS = 8;

/** Common asset decimals, used when a venue does not publish them. */
const DECIMALS: Record<string, number> = {
  BTC: 8,
  WBTC: 8,
  ETH: 18,
  WETH: 18,
  DAI: 18,
  USDC: 6,
  USDT: 6,
  USD: 2,
  EUR: 2,
  SOL: 9,
  POL: 18,
  MATIC: 18,
  XRP: 6,
  ADA: 6,
  DOT: 10,
  AVAX: 18,
  LINK: 18,
  DOGE: 8,
  SUI: 9,
};

export function decimalsFor(assetCode: string, fallback = DEFAULT_DECIMALS): number {
  return DECIMALS[assetCode.toUpperCase()] ?? fallback;
}

/** Convert a decimal string amount to bigint minor units at the given scale. */
export function toMinorUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid amount "${amount}".`);
  const [whole, fraction = ""] = raw.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const minor = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded === "" ? "0" : padded);
  return negative ? -minor : minor;
}

/** Human amount from minor units, for display. */
export function formatUnits(amountMinor: bigint, decimals: number): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const digits = decimals === 0 ? "" : fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = digits ? `${whole}.${digits}` : whole.toString();
  return negative ? `-${body}` : body;
}
