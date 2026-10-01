/**
 * Solana asset identity. Native SOL has no mint; SPL tokens are identified by
 * their mint address. A small registry maps well-known mints to the asset code
 * and decimals the ledger uses. Unknown mints are skipped rather than guessed.
 */

export interface SolanaMint {
  code: string;
  decimals: number;
}

export const SOL_CODE = "SOL";

/** Wrapped SOL. The registry entry lets a wrapped-SOL token account read as SOL. */
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const DEFAULT_MINT_REGISTRY: ReadonlyMap<string, SolanaMint> = new Map<string, SolanaMint>([
  [WRAPPED_SOL_MINT, { code: "SOL", decimals: 9 }],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { code: "USDC", decimals: 6 }],
  ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", { code: "USDT", decimals: 6 }],
]);

export function resolveMint(
  mint: string,
  registry: ReadonlyMap<string, SolanaMint> = DEFAULT_MINT_REGISTRY,
): SolanaMint | null {
  return registry.get(mint) ?? null;
}
