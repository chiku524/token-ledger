/**
 * Sui coin identity. A Sui coin type is a fully-qualified Move type string
 * (`0x2::sui::SUI`, `0x…::usdc::USDC`). A small registry maps the well-known
 * ones to the ledger's asset code and decimals. Unknown coin types are skipped
 * rather than guessed.
 *
 * Package ids are canonicalized so the same coin matches whether it is written
 * short (`0x2`) or zero-padded (`0x0000…0002`), which is how the GraphQL API
 * returns it.
 */

export interface SuiCoin {
  code: string;
  name: string;
  decimals: number;
}

export const SUI_COIN_TYPE = "0x2::sui::SUI";

const REGISTRY: Array<[string, SuiCoin]> = [
  [SUI_COIN_TYPE, { code: "SUI", name: "Sui", decimals: 9 }],
  // Circle's native USDC on Sui.
  [
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    { code: "USDC", name: "USD Coin", decimals: 6 },
  ],
];

const COINS: ReadonlyMap<string, SuiCoin> = new Map(
  REGISTRY.map(([coinType, coin]) => [normalizeCoinType(coinType), coin]),
);

/** Strip leading zeros from the package id and lowercase it; keep module/name. */
export function normalizeCoinType(coinType: string): string {
  const parts = coinType.split("::");
  if (parts.length !== 3) return coinType;
  const [packageId, module, name] = parts as [string, string, string];
  const digits = packageId.replace(/^0x/i, "");
  const short = digits === "" ? "0" : BigInt(`0x${digits}`).toString(16);
  return `0x${short}::${module}::${name}`;
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
