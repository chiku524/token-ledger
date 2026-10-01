/**
 * Map EVM RPC responses onto the ledger's normalized adapter types. Unknown
 * tokens are skipped. A zero native balance is a real observation.
 */
import { formatMinor } from "@/ledger";
import type { NormalizedBalance } from "../../types";
import { hexToMinorUnits } from "./amounts";
import type { EvmChain } from "./chains";
import type { TokenBalancesResult } from "./evm-responses";
import { resolveToken, tokenByCode } from "./tokens";

export interface EvmHolding {
  assetCode: string;
  name: string;
  decimals: number;
  formatted: string;
  quantityMinor: bigint;
}

/**
 * Native balance plus every registered ERC-20 balance for one address.
 * `tokenBalances` may be null when the endpoint has no enhanced methods.
 */
export function mapEvmBalances(
  chain: EvmChain,
  nativeHex: string,
  tokenBalances: TokenBalancesResult | null,
  now: Date = new Date(),
): NormalizedBalance[] {
  const asOf = now.toISOString();
  const byCode = new Map<string, bigint>();

  byCode.set(chain.nativeCode, hexToMinorUnits(nativeHex));

  for (const entry of tokenBalances?.tokenBalances ?? []) {
    const token = resolveToken(chain, entry.contractAddress);
    if (!token) continue;
    const amount = hexToMinorUnits(entry.tokenBalance);
    if (amount === 0n) continue;
    byCode.set(token.code, (byCode.get(token.code) ?? 0n) + amount);
  }

  return [...byCode].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
}

/** Readable holdings with name, decimals, and a human amount. */
export function describeEvmHoldings(chain: EvmChain, balances: readonly NormalizedBalance[]): EvmHolding[] {
  return balances.map((balance) => {
    const token = balance.assetCode === chain.nativeCode ? null : tokenByCode(chain, balance.assetCode);
    const decimals = token?.decimals ?? chain.nativeDecimals;
    return {
      assetCode: balance.assetCode,
      name: token?.name ?? chain.name,
      decimals,
      formatted: formatMinor(balance.quantityMinor, decimals, { grouping: false }),
      quantityMinor: balance.quantityMinor,
    };
  });
}
