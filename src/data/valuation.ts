/**
 * Turn the books into a valued view of holdings, with provenance and staleness.
 * Pure, so it is testable without a database. The latest observed snapshot per
 * source and asset is the holding; `valueHoldings` prices it.
 */
import { assetCarryingSchedule, proposeRevaluation, valueHoldings, type AssetPrice, type RevaluationProposal, type ValuationSummary } from "@/ledger";
import type { PostedJournalEntry } from "@/ledger";
import type { BooksAccount, BooksAsset, BooksBalanceSnapshot, StoredAssetPrice } from "./books";

export function latestSnapshots(snapshots: readonly BooksBalanceSnapshot[]): BooksBalanceSnapshot[] {
  const latest = new Map<string, BooksBalanceSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.sourceId}|${snapshot.assetCode}`;
    const current = latest.get(key);
    if (!current || snapshot.asOf > current.asOf) latest.set(key, snapshot);
  }
  return [...latest.values()];
}

/** The most recent observed quantity per source+asset. Zero is a real observation. */
export function holdingsFromSnapshots(
  snapshots: readonly BooksBalanceSnapshot[],
): Array<{ assetCode: string; quantityMinor: bigint }> {
  const byAsset = new Map<string, bigint>();
  for (const snapshot of latestSnapshots(snapshots)) {
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

/**
 * Build a revaluation proposal for one entity: carrying value per asset from the
 * journal, valued at the latest saved price. Returns a *proposal* — balanced
 * journal lines the accountant reviews and posts, never an automatic post.
 */
export function revaluationForEntity(input: {
  entries: readonly PostedJournalEntry[];
  accounts: readonly BooksAccount[];
  assets: readonly BooksAsset[];
  prices: readonly StoredAssetPrice[];
  entityId: string;
  quoteCurrency: string;
  assetAccountCode: string;
  gainAccountCode: string;
  lossAccountCode: string;
  asOf: string;
}): RevaluationProposal {
  const carrying = assetCarryingSchedule(input.entries, input.accounts, input.entityId);
  const decimals = new Map(input.assets.map((asset) => [asset.code, asset.decimals]));
  const entryDates = latestAcquisitionDates(input.entries, input.entityId);
  const holdings = carrying
    .filter((row) => row.currency === input.quoteCurrency && row.quantityMinor > 0n)
    .map((row) => ({
      assetCode: row.assetCode,
      quantityMinor: row.quantityMinor,
      quantityScale: decimals.get(row.assetCode) ?? 0,
      carryingMinor: row.carryingMinor,
      entryDate: entryDates.get(row.assetCode),
    }));
  return proposeRevaluation({
    prices: input.prices as readonly AssetPrice[],
    holdings,
    quoteCurrency: input.quoteCurrency,
    assetAccountCode: input.assetAccountCode,
    gainAccountCode: input.gainAccountCode,
    lossAccountCode: input.lossAccountCode,
    asOf: input.asOf,
  });
}

/** The date of the most recent entry that moved each asset into the entity. */
function latestAcquisitionDates(entries: readonly PostedJournalEntry[], entityId: string): Map<string, string> {
  const latest = new Map<string, string>();
  for (const entry of entries) {
    if (entry.entityId !== entityId) continue;
    for (const line of entry.lines) {
      if (!line.assetCode || line.quantityDirection !== "in") continue;
      const current = latest.get(line.assetCode);
      if (!current || entry.entryDate > current) latest.set(line.assetCode, entry.entryDate);
    }
  }
  return latest;
}
