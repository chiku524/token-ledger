/**
 * Turn the books into a valued view of holdings, with provenance and staleness.
 * Pure, so it is testable without a database. The latest observed snapshot per
 * source and asset is the holding; `valueHoldings` prices it.
 */
import { valueHoldings, type AssetPrice, type ValuationSummary } from "@/ledger";
import type { BooksBalanceSnapshot, StoredAssetPrice } from "./books";

/** The most recent observed quantity per source+asset. Zero is a real observation. */
export function holdingsFromSnapshots(
  snapshots: readonly BooksBalanceSnapshot[],
): Array<{ assetCode: string; quantityMinor: bigint }> {
  const latest = new Map<string, BooksBalanceSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.sourceId}|${snapshot.assetCode}`;
    const current = latest.get(key);
    if (!current || snapshot.asOf > current.asOf) latest.set(key, snapshot);
  }
  const byAsset = new Map<string, bigint>();
  for (const snapshot of latest.values()) {
    byAsset.set(snapshot.assetCode, (byAsset.get(snapshot.assetCode) ?? 0n) + snapshot.quantityMinor);
  }
  return [...byAsset.entries()].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor }));
}

export function valueBooksHoldings(input: {
  snapshots: readonly BooksBalanceSnapshot[];
  prices: readonly StoredAssetPrice[];
  assets: readonly { code: string; decimals: number }[];
  quoteCurrency: string;
  asOf: string;
  stalenessMs?: number;
}): ValuationSummary {
  const decimals = new Map(input.assets.map((asset) => [asset.code, asset.decimals]));
  const holdings = holdingsFromSnapshots(input.snapshots).map((holding) => ({
    ...holding,
    quantityScale: decimals.get(holding.assetCode) ?? 0,
  }));
  return valueHoldings({
    prices: input.prices as readonly AssetPrice[],
    holdings,
    quoteCurrency: input.quoteCurrency,
    asOf: input.asOf,
    stalenessMs: input.stalenessMs,
  });
}
