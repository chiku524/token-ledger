/**
 * Map Sui JSON-RPC responses onto the ledger's normalized adapter types.
 * Known coin types are mapped; unknown ones are skipped. A zero native balance
 * is a real observation.
 */
import { formatMinor } from "@/ledger";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { signedDecimalToMinorUnits, decimalStringToMinorUnits } from "./amounts";
import { normalizeCoinType, resolveSuiCoin, SUI_COIN_TYPE, suiCoinByCode } from "./coins";
import type { SuiCoinBalance, SuiTransactionBlock } from "./sui-responses";

export interface SuiHolding {
  assetCode: string;
  name: string;
  decimals: number;
  formatted: string;
  quantityMinor: bigint;
}

export function mapSuiBalances(
  balances: readonly SuiCoinBalance[],
  now: Date = new Date(),
): NormalizedBalance[] {
  const asOf = now.toISOString();
  const byCode = new Map<string, bigint>();

  for (const balance of balances) {
    const coin = resolveSuiCoin(balance.coinType);
    if (!coin) continue;
    const amount = decimalStringToMinorUnits(balance.totalBalance);
    if (amount === 0n) {
      // Keep a real zero only for native SUI; skip zero-value spam coins.
      if (normalizeCoinType(balance.coinType) !== SUI_COIN_TYPE) continue;
    }
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
  blocks: readonly SuiTransactionBlock[],
  watchedAddress: string,
): NormalizedSourceTransaction[] {
  const watched = watchedAddress.toLowerCase();
  const movements: NormalizedSourceTransaction[] = [];

  for (const block of blocks) {
    if (!block.timestampMs) continue;
    const byCode = new Map<string, bigint>();
    for (const change of block.balanceChanges ?? []) {
      const owner = change.owner?.AddressOwner?.toLowerCase();
      if (owner !== watched) continue;
      const coin = resolveSuiCoin(change.coinType);
      if (!coin) continue;
      const amount = signedDecimalToMinorUnits(change.amount);
      byCode.set(coin.code, (byCode.get(coin.code) ?? 0n) + amount);
    }

    const occurredOn = new Date(Number(block.timestampMs)).toISOString().slice(0, 10);
    for (const [assetCode, delta] of byCode) {
      if (delta === 0n) continue;
      movements.push({
        externalId: `${block.digest}:${assetCode}`,
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
