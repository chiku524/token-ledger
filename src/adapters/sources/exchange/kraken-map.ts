/**
 * Map Kraken responses onto the ledger's normalized adapter types.
 *
 * - Balances: one observed balance per asset, with the asset's decimals.
 * - Movements: ledger entries (deposits, withdrawals, transfers) and trades.
 *   A ledger `trade` entry is skipped because it is a leg of a trade and would
 *   double count against the trade movement. A trade is one movement in the
 *   asset bought or sold, at the trade's volume.
 *
 * The external id is the Kraken ledger id or trade id, unique per account.
 */
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../types";
import { formatMinor } from "@/ledger";
import { assetCodeForKey, decimalsForCode, assetCodeFromEntry } from "./kraken-assets";
import type {
  KrakenAssetsResult,
  KrakenLedgerEntry,
  KrakenTradeEntry,
} from "./kraken-responses";

export interface KrakenHolding {
  assetCode: string;
  decimals: number;
  formatted: string;
  quantityMinor: bigint;
}

/** Kraken amounts are decimal strings; convert to minor units at the asset scale. */
export function toMinor(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid Kraken amount "${amount}".`);
  const [whole, fraction = ""] = raw.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const minor = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded === "" ? "0" : padded);
  return negative ? -minor : minor;
}

export function mapKrakenBalances(
  balance: Record<string, string>,
  assets: KrakenAssetsResult,
  now: Date = new Date(),
): NormalizedBalance[] {
  const asOf = now.toISOString();
  const rows: NormalizedBalance[] = [];
  for (const [key, amount] of Object.entries(balance)) {
    const entry = assets[key];
    const code = entry ? assetCodeFromEntry(entry) : assetCodeForKey(key, assets);
    const decimals = entry?.decimals ?? decimalsForCode(code, assets);
    rows.push({ assetCode: code, quantityMinor: toMinor(amount, decimals), asOf });
  }
  return rows;
}

export function describeKrakenHoldings(
  balances: readonly NormalizedBalance[],
  assets: KrakenAssetsResult,
): KrakenHolding[] {
  return balances.map((balance) => {
    const decimals = decimalsForCode(balance.assetCode, assets);
    return {
      assetCode: balance.assetCode,
      decimals,
      formatted: formatMinor(balance.quantityMinor, decimals, { grouping: false }),
      quantityMinor: balance.quantityMinor,
    };
  });
}

const DEPOSIT_TYPES = new Set(["deposit", "transfer"]);

export function mapKrakenLedgers(
  ledger: Record<string, KrakenLedgerEntry>,
  assets: KrakenAssetsResult,
): NormalizedSourceTransaction[] {
  const movements: NormalizedSourceTransaction[] = [];
  for (const [id, entry] of Object.entries(ledger)) {
    // A trade leg is represented by the trade itself; skip to avoid double count.
    if (entry.type === "trade") continue;
    const code = assetCodeForKey(entry.asset, assets);
    const decimals = decimalsForCode(code, assets);
    const amount = toMinor(entry.amount, decimals);
    if (amount === 0n) continue;
    // A transfer's sign decides direction; a deposit is in, a withdrawal is out.
    const isIn = DEPOSIT_TYPES.has(entry.type) ? amount > 0n : entry.type === "deposit";
    movements.push({
      externalId: `kraken-ledger-${id}`,
      occurredOn: new Date(entry.time * 1000).toISOString().slice(0, 10),
      assetCode: code,
      direction: isIn ? "in" : "out",
      quantityMinor: amount > 0n ? amount : -amount,
      description: `Kraken ${entry.type}.`,
      chain: "kraken",
    });
  }
  return movements;
}

export function mapKrakenTrades(
  trades: Record<string, KrakenTradeEntry>,
  assets: KrakenAssetsResult,
): NormalizedSourceTransaction[] {
  const movements: NormalizedSourceTransaction[] = [];
  for (const [id, trade] of Object.entries(trades)) {
    // The base currency is the first leg of the pair ("XXBTZUSD" -> XBT).
    const baseKey = baseAssetOfPair(trade.pair);
    const code = baseKey ? assetCodeForKey(baseKey, assets) : null;
    if (!code) continue;
    const decimals = decimalsForCode(code, assets);
    const volume = toMinor(trade.vol, decimals);
    if (volume === 0n) continue;
    movements.push({
      externalId: `kraken-trade-${id}`,
      occurredOn: new Date(trade.time * 1000).toISOString().slice(0, 10),
      assetCode: code,
      direction: trade.type === "buy" ? "in" : "out",
      quantityMinor: volume,
      description: `Kraken trade (${trade.type}).`,
      chain: "kraken",
    });
  }
  return movements;
}

/** Split a Kraken pair into its base asset key. Pairs may be `XXBTZUSD` or `SOLUSD`. */
export function baseAssetOfPair(pair: string): string | null {
  for (const quote of ["ZUSD", "ZEUR", "ZGBP", "ZJPY", "USDT", "USDC", "USD", "EUR", "BTC", "XBT", "ETH"]) {
    if (pair.endsWith(quote) && pair.length > quote.length) {
      return pair.slice(0, pair.length - quote.length);
    }
  }
  return null;
}
