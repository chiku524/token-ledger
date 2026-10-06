/**
 * Chart series derived from posted journals. Amounts stay in minor units.
 * Rows that use different functional currencies are never added together.
 */
import { assetCarryingSchedule, netBalanceMinor, type TrialBalance } from "./reports";
import type { LedgerAccount, PostedJournalEntry } from "./types";
import { LedgerError } from "./types";

export interface SourceCarryMeta {
  id: string;
  kind: string;
}

export interface AssetChainMeta {
  code: string;
  chain: string | null;
}

export interface AssetClassMeta {
  code: string;
  assetClass: string;
}

export interface CarryingPoint {
  date: string;
  entityId: string;
  currency: string;
  carryingMinor: bigint;
}

export interface JournalMonthActivity {
  month: string;
  entityId: string;
  currency: string;
  count: number;
  debitMinor: bigint;
}

export interface ReconciliationCounts {
  matched: number;
  exception: number;
  bySource: Array<{ sourceId: string; matched: number; exception: number }>;
}

export interface AssetCarry {
  entityId: string;
  assetCode: string;
  measurementBasis: string;
  currency: string;
  carryingMinor: bigint;
}

export interface SourceCarry {
  sourceId: string;
  entityId: string;
  currency: string;
  kind: string;
  carryingMinor: bigint;
}

export function percentOf(part: bigint, total: bigint): string {
  if (total === 0n) return "0.0%";
  const negative = part < 0n;
  const absolutePart = negative ? -part : part;
  const absoluteTotal = total < 0n ? -total : total;
  const tenths = (absolutePart * 1000n + absoluteTotal / 2n) / absoluteTotal;
  return `${negative ? "-" : ""}${tenths / 10n}.${tenths % 10n}%`;
}

export function carryingByAsset(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
): AssetCarry[] {
  const rows: AssetCarry[] = [];
  for (const entityId of entityOrder(accounts, entries)) {
    for (const row of assetCarryingSchedule(entries, accounts, entityId)) {
      rows.push({
        entityId,
        assetCode: row.assetCode,
        measurementBasis: row.measurementBasis,
        currency: row.currency,
        carryingMinor: row.carryingMinor,
      });
    }
  }
  return rows.sort(byAmountThenLabel((row) => row.assetCode));
}

export function carryingBySource(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  sources: readonly SourceCarryMeta[],
): SourceCarry[] {
  const chart = accountChart(accounts);
  const kinds = new Map(sources.map((source) => [source.id, source.kind]));
  const totals = new Map<string, SourceCarry>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const delta = measurementDelta(entry, line, chart);
      if (delta === null) continue;
      const sourceId = line.sourceId ?? "unassigned";
      const key = `${entry.entityId}|${sourceId}|${line.currency}`;
      const current = totals.get(key) ?? {
        sourceId,
        entityId: entry.entityId,
        currency: line.currency,
        kind: kinds.get(sourceId) ?? "unassigned",
        carryingMinor: 0n,
      };
      current.carryingMinor += delta;
      totals.set(key, current);
    }
  }

  return [...totals.values()].filter((row) => row.carryingMinor !== 0n).sort(byAmountThenLabel((row) => row.sourceId));
}

export function carryingBySourceKind(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  sources: readonly SourceCarryMeta[],
): Array<Omit<SourceCarry, "sourceId">> {
  const grouped = new Map<string, Omit<SourceCarry, "sourceId">>();
  for (const row of carryingBySource(entries, accounts, sources)) {
    const key = `${row.entityId}|${row.kind}|${row.currency}`;
    const current = grouped.get(key) ?? {
      entityId: row.entityId,
      currency: row.currency,
      kind: row.kind,
      carryingMinor: 0n,
    };
    current.carryingMinor += row.carryingMinor;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(byAmountThenLabel((row) => row.kind));
}

export function carryingByChain(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  assets: readonly AssetChainMeta[],
): Array<{ chain: string; entityId: string; currency: string; carryingMinor: bigint }> {
  const chains = new Map(assets.map((asset) => [asset.code, asset.chain?.trim() || "unspecified"]));
  const grouped = new Map<string, { chain: string; entityId: string; currency: string; carryingMinor: bigint }>();
  for (const row of carryingByAsset(entries, accounts)) {
    const chain = chains.get(row.assetCode) ?? "unspecified";
    const key = `${row.entityId}|${chain}|${row.currency}`;
    const current = grouped.get(key) ?? { chain, entityId: row.entityId, currency: row.currency, carryingMinor: 0n };
    current.carryingMinor += row.carryingMinor;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(byAmountThenLabel((row) => row.chain));
}

/**
 * Carrying value grouped by the held asset's class (crypto, stablecoin, RWA,
 * fiat). The asset model carries the class; holdings only carry the code. An
 * asset the class registry does not know falls to "unspecified" rather than
 * being dropped. Same shape as carryingByChain.
 */
export function carryingByAssetClass(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  assets: readonly AssetClassMeta[],
): Array<{ assetClass: string; entityId: string; currency: string; carryingMinor: bigint }> {
  const classes = new Map(assets.map((asset) => [asset.code, asset.assetClass.trim() || "unspecified"]));
  const grouped = new Map<string, { assetClass: string; entityId: string; currency: string; carryingMinor: bigint }>();
  for (const row of carryingByAsset(entries, accounts)) {
    const assetClass = classes.get(row.assetCode) ?? "unspecified";
    const key = `${row.entityId}|${assetClass}|${row.currency}`;
    const current = grouped.get(key) ?? { assetClass, entityId: row.entityId, currency: row.currency, carryingMinor: 0n };
    current.carryingMinor += row.carryingMinor;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(byAmountThenLabel((row) => row.assetClass));
}

export function carryingValueSeries(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
): CarryingPoint[] {
  const chart = accountChart(accounts);
  const currencyByEntity = new Map<string, string>();
  for (const entry of entries) {
    const existing = currencyByEntity.get(entry.entityId);
    if (existing && existing !== entry.currency) {
      throw new LedgerError(
        "MIXED_CURRENCY",
        `Entity ${entry.entityId} has journal entries in more than one functional currency.`,
      );
    }
    currencyByEntity.set(entry.entityId, entry.currency);
  }

  const totals = new Map<string, bigint>();
  const dates = [...new Set(entries.map((entry) => entry.entryDate))].sort();
  const points: CarryingPoint[] = [];

  for (const date of dates) {
    const dated = entries
      .filter((entry) => entry.entryDate === date)
      .slice()
      .sort((a, b) => a.reference.localeCompare(b.reference));
    for (const entry of dated) {
      for (const line of entry.lines) {
        const delta = measurementDelta(entry, line, chart);
        if (delta === null) continue;
        totals.set(entry.entityId, (totals.get(entry.entityId) ?? 0n) + delta);
      }
    }
    for (const entityId of entityOrder(accounts, entries)) {
      const currency = currencyByEntity.get(entityId);
      if (!currency) continue;
      points.push({
        date,
        entityId,
        currency,
        carryingMinor: totals.get(entityId) ?? 0n,
      });
    }
  }

  return points;
}

export function assetAccountNets(report: TrialBalance): Array<{ code: string; name: string; netMinor: bigint }> {
  return report.rows
    .filter((row) => row.type === "asset")
    .map((row) => ({ code: row.code, name: row.name, netMinor: netBalanceMinor(row) }))
    .filter((row) => row.netMinor !== 0n);
}

export function journalActivityByMonth(entries: readonly PostedJournalEntry[]): JournalMonthActivity[] {
  const grouped = new Map<string, JournalMonthActivity>();
  for (const entry of entries) {
    const month = entry.entryDate.slice(0, 7);
    const key = `${month}|${entry.entityId}|${entry.currency}`;
    const current = grouped.get(key) ?? {
      month,
      entityId: entry.entityId,
      currency: entry.currency,
      count: 0,
      debitMinor: 0n,
    };
    current.count += 1;
    current.debitMinor += entry.debitMinor;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.entityId.localeCompare(b.entityId),
  );
}

export function reconciliationCounts(
  records: readonly { status: "matched" | "exception"; sourceId: string }[],
): ReconciliationCounts {
  const bySource = new Map<string, { sourceId: string; matched: number; exception: number }>();
  let matched = 0;
  let exception = 0;
  for (const record of records) {
    const current = bySource.get(record.sourceId) ?? { sourceId: record.sourceId, matched: 0, exception: 0 };
    if (record.status === "exception") {
      exception += 1;
      current.exception += 1;
    } else {
      matched += 1;
      current.matched += 1;
    }
    bySource.set(record.sourceId, current);
  }
  return {
    matched,
    exception,
    bySource: [...bySource.values()].sort(
      (a, b) => b.exception - a.exception || b.matched - a.matched || a.sourceId.localeCompare(b.sourceId),
    ),
  };
}

function measurementDelta(
  entry: PostedJournalEntry,
  line: PostedJournalEntry["lines"][number],
  chart: Map<string, LedgerAccount>,
): bigint | null {
  const account = chart.get(`${entry.entityId}:${line.accountCode}`);
  if (!account) {
    throw new LedgerError("UNKNOWN_ACCOUNT", `Unknown account ${line.accountCode} on ${entry.reference}.`);
  }
  if (!account.measurementBasis) return null;
  if (!line.assetCode) {
    throw new LedgerError(
      "MISSING_ASSET",
      `Entry ${entry.reference} posts to ${account.code} (${account.measurementBasis}) without an assetCode.`,
    );
  }
  const sign = line.side === account.normalBalance ? 1n : -1n;
  return sign * line.amountMinor;
}

function accountChart(accounts: readonly LedgerAccount[]): Map<string, LedgerAccount> {
  return new Map(accounts.map((account) => [`${account.entityId}:${account.code}`, account]));
}

function entityOrder(accounts: readonly LedgerAccount[], entries: readonly PostedJournalEntry[]): string[] {
  const ids: string[] = [];
  for (const account of accounts) {
    if (!ids.includes(account.entityId)) ids.push(account.entityId);
  }
  for (const entry of entries) {
    if (!ids.includes(entry.entityId)) ids.push(entry.entityId);
  }
  return ids;
}

function byAmountThenLabel<T extends { currency: string; carryingMinor: bigint }>(label: (row: T) => string) {
  return (a: T, b: T) => {
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    if (a.carryingMinor !== b.carryingMinor) return a.carryingMinor > b.carryingMinor ? -1 : 1;
    return label(a).localeCompare(label(b));
  };
}
