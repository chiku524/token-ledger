/**
 * Map Solana JSON-RPC responses onto the ledger's normalized adapter types.
 * Unknown mints are skipped, not guessed. Native SOL is always observed, so a
 * zero native balance is a real observation rather than missing data.
 */
import type { NormalizedBalance } from "../../types";
import { toMinorUnits } from "./amounts";
import { SOL_CODE, resolveMint, type SolanaMint } from "./mints";
import type { BalanceResult, TokenAccountsResult } from "./solana-responses";

export function mapBalancesToObservations(
  native: BalanceResult,
  tokens: TokenAccountsResult,
  now: Date = new Date(),
  registry?: ReadonlyMap<string, SolanaMint>,
): NormalizedBalance[] {
  const asOf = now.toISOString();
  const byCode = new Map<string, bigint>();

  byCode.set(SOL_CODE, toMinorUnits(native.value));

  for (const token of tokens.value) {
    const info = token.account.data.parsed.info;
    const resolved = resolveMint(info.mint, registry);
    if (!resolved) continue;
    const amount = toMinorUnits(info.tokenAmount.amount);
    if (amount === 0n) continue;
    byCode.set(resolved.code, (byCode.get(resolved.code) ?? 0n) + amount);
  }

  return [...byCode].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
}
