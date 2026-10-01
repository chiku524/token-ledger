/**
 * Map Sui GraphQL responses onto the ledger's normalized adapter types.
 * Known coin types are resolved through the registry (package ids are
 * canonicalized, so a zero-padded id matches a short one). Unknown coins are
 * skipped. A zero native balance is a real observation.
 */
import { formatMinor } from "@/ledger";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { decimalStringToMinorUnits, signedDecimalToMinorUnits } from "./amounts";
import { normalizeCoinType, resolveSuiCoin, SUI_COIN_TYPE, suiCoinByCode } from "./coins";
import type { SuiGraphqlBalanceNode, SuiGraphqlTransactionNode } from "./sui-responses";

export interface SuiHolding {
  assetCode: string;
  name: string;
  decimals: number;
  formatted: string;
  quantityMinor: bigint;
}

export function mapSuiBalances(
  nodes: readonly SuiGraphqlBalanceNode[],
  now: Date = new Date(),
): NormalizedBalance[] {
  const asOf = now.toISOString();
  const byCode = new Map<string, bigint>();

  for (const node of nodes) {
    const coin = resolveSuiCoin(node.coinType.repr);
    if (!coin) continue;
    const amount = decimalStringToMinorUnits(node.totalBalance);
    if (amount === 0n && normalizeCoinType(node.coinType.repr) !== SUI_COIN_TYPE) continue;
    byCode.set(coin.code, (byCode.get(coin.code) ?? 0n) + amount);
  }

  // Native SUI is always observed, even when the address holds nothing.
  if (!byCode.has("SUI")) byCode.set("SUI", 0n);

  return [...byCode].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
}

export function describeSuiHoldings(balances: readonly NormalizedBalance[]): SuiHolding[] {
  return balances.map((balance) => {
    const coin = suiCoinByCode(balance.assetCode);
    const decimals = coin?.decimals ?? 9;
    return {
      assetCode: balance.assetCode,
      name: coin?.name ?? balance.assetCode,
      decimals,
      formatted: formatMinor(balance.quantityMinor, decimals, { grouping: false }),
      quantityMinor: balance.quantityMinor,
    };
  });
}

/**
 * One movement per asset per transaction, from the net balance change for the
 * watched address. A self-transfer nets to zero and is skipped.
 */
export function mapSuiTransactions(
  nodes: readonly SuiGraphqlTransactionNode[],
  watchedAddress: string,
): NormalizedSourceTransaction[] {
  const watched = watchedAddress.toLowerCase();
  const movements: NormalizedSourceTransaction[] = [];

  for (const node of nodes) {
    const effects = node.effects;
    if (!effects || !effects.timestamp) continue;

    const byCode = new Map<string, bigint>();
    for (const change of effects.balanceChanges?.nodes ?? []) {
      // Balance changes cover every owner in the transaction; keep only ours.
      if (change.owner?.address?.toLowerCase() !== watched) continue;
      const coin = resolveSuiCoin(change.coinType.repr);
      if (!coin) continue;
      const amount = signedDecimalToMinorUnits(change.amount);
      byCode.set(coin.code, (byCode.get(coin.code) ?? 0n) + amount);
    }

    const occurredOn = new Date(effects.timestamp).toISOString().slice(0, 10);
    for (const [assetCode, delta] of byCode) {
      if (delta === 0n) continue;
      movements.push({
        externalId: `${node.digest}:${assetCode}`,
        occurredOn,
        assetCode,
        direction: delta > 0n ? "in" : "out",
        quantityMinor: delta > 0n ? delta : -delta,
        description: delta > 0n ? `Sui receipt of ${assetCode}.` : `Sui transfer of ${assetCode}.`,
        chain: "sui",
      });
    }
  }

  return movements;
}
