/**
 * Serializable chart rows for the example books. Built only from the ledger.
 * MYR and SGD stay in separate panels so the charts do not invent a translation rate.
 */
import {
  assetAccountNets,
  carryingByAsset,
  carryingByChain,
  carryingBySource,
  carryingBySourceKind,
  carryingValueSeries,
  journalActivityByMonth,
  minorToNumber,
  percentOf,
  reconciliationCounts,
  trialBalance,
} from "@/ledger";
import type { Books } from "./books";
import { exampleBooks } from "./example-books";
import { formatMoney } from "./present";

const FIAT_SCALE = 2;
const SERIES_COLORS = ["#1c6b45", "#3e4c5e", "#9a7340", "#8e2f2c"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MoneyRow {
  id: string;
  label: string;
  value: number;
  formatted: string;
}

export interface MoneyPanel {
  id: string;
  title: string;
  currency: string;
  rows: MoneyRow[];
}

export interface LinePanel {
  id: string;
  title: string;
  points: Array<{ id: string; label: string; axisLabel: string; value: number; formatted: string }>;
}

export interface CountSeries {
  id: string;
  label: string;
  color: string;
}

export interface ActivityChart {
  rows: Array<{ label: string; fullLabel: string } & Record<string, number | string>>;
  series: CountSeries[];
}

export interface StatusRow {
  id: string;
  label: string;
  value: number;
  formatted: string;
  fill: string;
}

export interface SourceStatusRow {
  id: string;
  label: string;
  matched: number;
  exception: number;
}

const marketName: Record<string, string> = { MY: "Malaysia", SG: "Singapore" };

function market(books: Books, entityId: string): string {
  const entity = books.entities.find((item) => item.id === entityId);
  if (!entity) return entityId;
  return marketName[entity.jurisdiction] ?? entity.jurisdiction;
}

function sourceLabel(books: Books, id: string): string {
  return books.sources.find((source) => source.id === id)?.name ?? id;
}

function moneyRow(id: string, label: string, amountMinor: bigint, currency: string, total: bigint): MoneyRow {
  return {
    id,
    label,
    value: minorToNumber(amountMinor, FIAT_SCALE),
    formatted: `${formatMoney(amountMinor, currency)} · ${percentOf(amountMinor, total)}`,
  };
}

function panels(
  books: Books,
  rows: Array<{ id: string; label: string; currency: string; entityId: string; carryingMinor: bigint }>,
  titleFor: (currency: string) => string,
): MoneyPanel[] {
  const order: string[] = books.entities.map((entity) => entity.functionalCurrency);
  const currencies = [...new Set(rows.map((row) => row.currency))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  return currencies.flatMap((currency) => {
    const group = rows
      .filter((row) => row.currency === currency)
      .slice()
      .sort((a, b) => (a.carryingMinor === b.carryingMinor ? a.label.localeCompare(b.label) : a.carryingMinor > b.carryingMinor ? -1 : 1));
    const total = group.reduce((sum, row) => sum + row.carryingMinor, 0n);
    if (group.length === 0) return [];
    return [
      {
        id: currency,
        title: titleFor(currency),
        currency,
        rows: group.map((row) => moneyRow(row.id, row.label, row.carryingMinor, currency, total)),
      },
    ];
  });
}

export function assetAllocationPanels(books: Books = exampleBooks): MoneyPanel[] {
  return panels(
    books,
    carryingByAsset(books.journalEntries, books.accounts).map((row) => ({
      id: `${row.entityId}-${row.assetCode}`,
      label: `${row.assetCode} · ${row.measurementBasis}`,
      currency: row.currency,
      entityId: row.entityId,
      carryingMinor: row.carryingMinor,
    })),
    (currency) => `By asset · ${currency}`,
  );
}

export function sourceCarryingPanels(books: Books = exampleBooks): MoneyPanel[] {
  return panels(
    books,
    carryingBySource(
      books.journalEntries,
      books.accounts,
      books.sources.map((source) => ({ id: source.id, kind: source.kind })),
    ).map((row) => ({
      id: row.sourceId,
      label: sourceLabel(books, row.sourceId),
      currency: row.currency,
      entityId: row.entityId,
      carryingMinor: row.carryingMinor,
    })),
    (currency) => `By source · ${currency}`,
  );
}

export function sourceKindPanels(books: Books = exampleBooks): MoneyPanel[] {
  return panels(
    books,
    carryingBySourceKind(
      books.journalEntries,
      books.accounts,
      books.sources.map((source) => ({ id: source.id, kind: source.kind })),
    ).map((row) => ({
      id: `${row.entityId}-${row.kind}`,
      label: titleCase(row.kind),
      currency: row.currency,
      entityId: row.entityId,
      carryingMinor: row.carryingMinor,
    })),
    (currency) => `By source type · ${currency}`,
  );
}

export function chainPanels(books: Books = exampleBooks): MoneyPanel[] {
  return panels(
    books,
    carryingByChain(books.journalEntries, books.accounts, books.assets).map((row) => ({
      id: `${row.entityId}-${row.chain}`,
      label: titleCase(row.chain),
      currency: row.currency,
      entityId: row.entityId,
      carryingMinor: row.carryingMinor,
    })),
    (currency) => `By chain · ${currency}`,
  );
}

export function carryingSeries(books: Books = exampleBooks): LinePanel[] {
  const points = carryingValueSeries(books.journalEntries, books.accounts);
  return books.entities.flatMap((entity) => {
    const series = points.filter((point) => point.entityId === entity.id);
    if (series.length === 0) return [];
    return [
      {
        id: entity.id,
        title: `${market(books, entity.id)} · ${entity.functionalCurrency}`,
        points: series.map((point) => ({
          id: `${entity.id}-${point.date}`,
          label: point.date,
          axisLabel: dayLabel(point.date),
          value: minorToNumber(point.carryingMinor, FIAT_SCALE),
          formatted: formatMoney(point.carryingMinor, point.currency),
        })),
      },
    ];
  });
}

const accountShortName: Record<string, string> = {
  "1000": "Cash",
  "1310": "Intangible assets",
  "1320": "Inventory",
  "1330": "Stablecoins",
};

export function compositionPanels(books: Books = exampleBooks): MoneyPanel[] {
  return books.entities.flatMap((entity) => {
    const report = trialBalance(books.journalEntries, books.accounts, entity.id);
    const nets = assetAccountNets(report);
    if (!report.currency || nets.length === 0) return [];
    const total = nets.reduce((sum, row) => sum + row.netMinor, 0n);
    return [
      {
        id: entity.id,
        title: `${market(books, entity.id)} · ${report.currency}`,
        currency: report.currency,
        rows: nets.map((row) =>
          moneyRow(row.code, accountShortName[row.code] ?? row.name, row.netMinor, report.currency ?? entity.functionalCurrency, total),
        ),
      },
    ];
  });
}

export function reportComposition(entityId: string, books: Books = exampleBooks): MoneyRow[] {
  return compositionPanels(books).find((panel) => panel.id === entityId)?.rows ?? [];
}

export function reportAssetBars(entityId: string, books: Books = exampleBooks): MoneyRow[] {
  const entity = books.entities.find((item) => item.id === entityId);
  if (!entity) return [];
  const rows = carryingByAsset(books.journalEntries, books.accounts).filter((row) => row.entityId === entityId);
  const total = rows.reduce((sum, row) => sum + row.carryingMinor, 0n);
  return rows
    .slice()
    .sort((a, b) => (a.carryingMinor === b.carryingMinor ? a.assetCode.localeCompare(b.assetCode) : a.carryingMinor > b.carryingMinor ? -1 : 1))
    .map((row) => moneyRow(`${row.entityId}-${row.assetCode}`, `${row.assetCode} · ${row.measurementBasis}`, row.carryingMinor, entity.functionalCurrency, total));
}

export function journalActivityChart(books: Books = exampleBooks): ActivityChart {
  const activity = journalActivityByMonth(books.journalEntries);
  const months = [...new Set(activity.map((row) => row.month))];
  const series = books.entities.map((entity, index) => ({
    id: entity.id,
    label: market(books, entity.id),
    color: SERIES_COLORS[index % SERIES_COLORS.length] ?? "#1c1915",
  }));
  return {
    series,
    rows: months.map((month) => {
      const row: { label: string; fullLabel: string } & Record<string, number | string> = {
        label: MONTHS[Number(month.slice(5, 7)) - 1] ?? month,
        fullLabel: monthLabel(month),
      };
      for (const item of series) {
        row[item.id] = activity.find((entry) => entry.month === month && entry.entityId === item.id)?.count ?? 0;
      }
      return row;
    }),
  };
}

export function reconciliationStatus(books: Books = exampleBooks): { total: number; rows: StatusRow[] } {
  const counts = reconciliationCounts(books.reconciliations);
  return {
    total: counts.matched + counts.exception,
    rows: [
      { id: "matched", label: "Matched", value: counts.matched, formatted: String(counts.matched), fill: "#1c6b45" },
      { id: "exception", label: "Exceptions", value: counts.exception, formatted: String(counts.exception), fill: "#8e2f2c" },
    ],
  };
}

export function reconciliationBySource(books: Books = exampleBooks): SourceStatusRow[] {
  return reconciliationCounts(books.reconciliations).bySource.map((row) => ({
    id: row.sourceId,
    label: sourceLabel(books, row.sourceId),
    matched: row.matched,
    exception: row.exception,
  }));
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function dayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month}`;
}

function monthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split("-");
  return `${MONTHS[Number(month) - 1] ?? isoMonth} ${year}`;
}
