/**
 * Sui coin identity. A Sui coin type is a fully-qualified Move type string
 * (`0x2::sui::SUI`, `0x…::usdc::USDC`). A small registry maps the well-known
 * ones to the ledger's asset code and decimals. Unknown coin types are skipped
 * rather than guessed.
 */

export interface SuiCoin {
  code: string;
  name: string;
  decimals: number;
}

export const SUI_COIN_TYPE = "0x2::sui::SUI";

const COINS: ReadonlyMap<string, SuiCoin> = new Map<string, SuiCoin>([
  [SUI_COIN_TYPE, { code: "SUI", name: "Sui", decimals: 9 }],
  // Circle's native USDC on Sui, a single well-known package.
  [
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    { code: "USDC", name: "USD Coin", decimals: 6 },
  ],
]);

/** A Move coin type is `<packageId>::<module>::<NAME>`. */
export function isSuiCoinType(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]+::[A-Za-z0-9_]+::[A-Za-z0-9_]+$/.test(value);
}

export function resolveSuiCoin(coinType: string): SuiCoin | null {
  return COINS.get(normalizeCoinType(coinType)) ?? null;
}

/** Find a registered coin by its ledger asset code. */
export function suiCoinByCode(code: string): SuiCoin | null {
  for (const coin of COINS.values()) {
    if (coin.code === code) return coin;
  }
  return null;
}

/** Sui lowercases the address part of a coin type but not the module/name. */
export function normalizeCoinType(coinType: string): string {
  const parts = coinType.split("::");
  if (parts.length !== 3) return coinType;
  return `${parts[0]!.toLowerCase()}::${parts[1]}::${parts[2]}`;
}
