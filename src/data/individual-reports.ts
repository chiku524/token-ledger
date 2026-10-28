/**
 * Plain-language reports for an individual account.
 *
 * An individual sees what they hold, what moved, and what it was worth. This
 * module builds those three views from data that already exists: the latest
 * observed balances, the source transactions read from their wallets and
 * exchanges, and saved prices. It never touches the journal and uses no
 * accounting terms, so every string here is safe to show to an individual.
 * Pure, so it is testable without a database.
 */
import { formatMinor, percentOf, toCsv } from "@/ledger";
import type { Books, BooksBalanceSnapshot } from "./books";
import { isHoldingsDisplayCurrency, resolveHoldingsDisplayCurrency } from "./display-currency";
import type { DateRange } from "./period";
import { formatMoney, formatQuantity, movementLabel, sourceName } from "./present";
import { valueBooksHoldings } from "./valuation";

/** The export kinds an individual may download. `pdf` is the full report. */
export const INDIVIDUAL_REPORT_KINDS = ["pdf", "portfolio", "activity", "value-over-time"] as const;
export type IndividualReportKind = (typeof INDIVIDUAL_REPORT_KINDS)[number];

/** Names an individual sees for their reports and downloads. */
export const INDIVIDUAL_REPORT_NAMES = {
  portfolio: "Portfolio summary",
  activity: "Activity history",
  valueOverTime: "Value over time",
  pdf: "PDF report",
} as const;

export const INDIVIDUAL_REPORT_NOTICE =
  "Values use the latest saved market prices and are an estimate, not tax or financial advice. Balances and activity are read from your connected wallets and exchanges.";

/** Plain column names used by every individual download. */
export const INDIVIDUAL_CSV_HEADERS = {
  portfolio: ["Date", "Asset", "Amount", "Value", "Currency", "Share of portfolio"],
  activity: ["Date", "Type", "Asset", "Amount", "Account/Source", "Note"],
  valueOverTime: ["Date", "Value", "Currency"],
} as const;

const MONEY_SCALE = 2;

/** The currency a report is valued in: the request, else the account's own, else USD. */
export function individualCurrency(requested: string | undefined, accountCurrency?: string): string {
  const fallback = accountCurrency && isHoldingsDisplayCurrency(accountCurrency) ? accountCurrency : "USD";
  return resolveHoldingsDisplayCurrency(requested, fallback);
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** The pricing instant for a calendar day: its end, but never in the future. */
function pricingInstant(day: string, now: Date): string {
  const endOfDay = Date.parse(`${day}T23:59:59.999Z`);
  return new Date(Math.min(endOfDay, now.getTime())).toISOString();
}

function snapshotsOn(snapshots: readonly BooksBalanceSnapshot[], day: string): BooksBalanceSnapshot[] {
  return snapshots.filter((snapshot) => dayOf(snapshot.asOf) <= day);
}

function money(amountMinor: bigint): string {
  return formatMinor(amountMinor, MONEY_SCALE, { minFraction: 2, maxFraction: 2, grouping: false });
}

function plainQuantity(books: Books, assetCode: string, quantityMinor: bigint): string {
  const decimals = books.assets.find((asset) => asset.code === assetCode)?.decimals ?? 0;
  return formatMinor(quantityMinor, decimals, { grouping: false });
}

/** A spreadsheet would run a cell that starts with these as a formula. */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// ---------------------------------------------------------------- Portfolio

export interface PortfolioRow {
  assetCode: string;
  assetName: string;
  quantityMinor: bigint;
  amount: string;
  valueMinor: bigint;
  value: string;
  /** 0-100, for a bar. */
  share: number;
  shareLabel: string;
  stale: boolean;
}

export interface PortfolioSummary {
  currency: string;
  asOf: string;
  rows: PortfolioRow[];
  unpriced: Array<{ assetCode: string; amount: string }>;
  totalMinor: bigint;
  total: string;
  /** Some holding has no price, or a price is more than a day old. */
  partial: boolean;
}

export function portfolioSummary(books: Books, input: { asOf: string; currency: string; now?: Date }): PortfolioSummary {
  const now = input.now ?? new Date();
  const summary = valueBooksHoldings({
    snapshots: snapshotsOn(books.balanceSnapshots, input.asOf),
    prices: books.assetPrices,
    assets: books.assets,
    quoteCurrency: input.currency,
    asOf: pricingInstant(input.asOf, now),
    rates: books.fxRates,
  });
  const total = summary.totalMinor;
  const rows = [...summary.rows]
    .sort((a, b) => (a.valueMinor === b.valueMinor ? a.assetCode.localeCompare(b.assetCode) : a.valueMinor > b.valueMinor ? -1 : 1))
    .map((row): PortfolioRow => {
      const share = total > 0n ? Number((row.valueMinor * 10000n) / total) / 100 : 0;
      return {
        assetCode: row.assetCode,
        assetName: books.assets.find((asset) => asset.code === row.assetCode)?.name ?? row.assetCode,
        quantityMinor: row.quantityMinor,
        amount: formatQuantity(row.quantityMinor, row.assetCode, books.assets),
        valueMinor: row.valueMinor,
        value: formatMoney(row.valueMinor, input.currency),
        share,
        shareLabel: percentOf(row.valueMinor, total),
        stale: row.age === "stale",
      };
    });
  return {
    currency: input.currency,
    asOf: input.asOf,
    rows,
    unpriced: summary.unpriced.map((row) => ({
      assetCode: row.assetCode,
      amount: formatQuantity(row.quantityMinor, row.assetCode, books.assets),
    })),
    totalMinor: total,
    total: formatMoney(total, input.currency),
    partial: summary.incomplete || summary.stale,
  };
}

export function portfolioCsv(books: Books, summary: PortfolioSummary): string {
  return toCsv(
    INDIVIDUAL_CSV_HEADERS.portfolio,
    summary.rows.map((row) => [
      summary.asOf,
      safeCell(row.assetCode),
      plainQuantity(books, row.assetCode, row.quantityMinor),
      money(row.valueMinor),
      summary.currency,
      row.shareLabel,
    ]),
  );
}

// ----------------------------------------------------------------- Activity

export interface ActivityRow {
  id: string;
  date: string;
  /** Received, Sent, or Balance change. */
  type: string;
  assetCode: string;
  /** Signed: negative when it left an account. */
  quantityMinor: bigint;
  amount: string;
  /** Account or source name. */
  source: string;
  note: string;
}

export interface ActivityHistory {
  range: DateRange;
  /** What moved, newest first: transfers read from wallets and exchanges. */
  transactions: ActivityRow[];
  /** How each observed balance changed between checks, newest first. */
  balanceChanges: ActivityRow[];
}

function signedQuantity(books: Books, assetCode: string, quantityMinor: bigint): string {
  const text = formatQuantity(quantityMinor < 0n ? -quantityMinor : quantityMinor, assetCode, books.assets);
  return `${quantityMinor < 0n ? "-" : "+"}${text}`;
}

function newestFirst(a: ActivityRow, b: ActivityRow): number {
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

export function activityHistory(books: Books, range: DateRange): ActivityHistory {
  const inRange = (day: string) => day >= range.from && day <= range.to;

  const transactions = books.sourceTransactions
    .filter((transaction) => inRange(transaction.occurredOn))
    .map((transaction): ActivityRow => {
      const signed = transaction.direction === "out" ? -transaction.quantityMinor : transaction.quantityMinor;
      return {
        id: transaction.id,
        date: transaction.occurredOn,
        type: movementLabel(transaction.direction),
        assetCode: transaction.assetCode,
        quantityMinor: signed,
        amount: signedQuantity(books, transaction.assetCode, signed),
        source: sourceName(transaction.sourceId, books.sources),
        note: transaction.description,
      };
    })
    .sort(newestFirst);

  const grouped = new Map<string, BooksBalanceSnapshot[]>();
  for (const snapshot of books.balanceSnapshots) {
    const key = `${snapshot.sourceId}|${snapshot.assetCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
  }
  const balanceChanges: ActivityRow[] = [];
  for (const series of grouped.values()) {
    const ordered = [...series].sort((a, b) => a.asOf.localeCompare(b.asOf) || a.id.localeCompare(b.id));
    ordered.forEach((snapshot, index) => {
      const previous = ordered[index - 1];
      const change = snapshot.quantityMinor - (previous?.quantityMinor ?? 0n);
      if (change === 0n) return;
      const day = dayOf(snapshot.asOf);
      if (!inRange(day)) return;
      balanceChanges.push({
        id: snapshot.id,
        date: day,
        type: "Balance change",
        assetCode: snapshot.assetCode,
        quantityMinor: change,
        amount: signedQuantity(books, snapshot.assetCode, change),
        source: sourceName(snapshot.sourceId, books.sources),
        note: previous
          ? `Balance went from ${formatQuantity(previous.quantityMinor, snapshot.assetCode, books.assets)} to ${formatQuantity(snapshot.quantityMinor, snapshot.assetCode, books.assets)}.`
          : `First balance seen: ${formatQuantity(snapshot.quantityMinor, snapshot.assetCode, books.assets)}.`,
      });
    });
  }
  balanceChanges.sort(newestFirst);
  return { range, transactions, balanceChanges };
}

export function activityCsv(books: Books, history: ActivityHistory): string {
  const rows = [...history.transactions, ...history.balanceChanges].sort(newestFirst);
  return toCsv(
    INDIVIDUAL_CSV_HEADERS.activity,
    rows.map((row) => [
      row.date,
      row.type,
      safeCell(row.assetCode),
      plainQuantity(books, row.assetCode, row.quantityMinor),
      safeCell(row.source),
      safeCell(row.note),
    ]),
  );
}

// ---------------------------------------------------------- Value over time

export interface ValuePoint {
  date: string;
  valueMinor: bigint;
  value: string;
}

export interface ValueOverTime {
  currency: string;
  range: DateRange;
  points: ValuePoint[];
  /** Dates left out because a holding had no price yet. */
  skipped: number;
}

const MAX_POINTS = 120;

export function valueOverTime(books: Books, input: { range: DateRange; currency: string; now?: Date }): ValueOverTime {
  const now = input.now ?? new Date();
  const today = dayOf(now.toISOString());
  const days = new Set<string>();
  for (const snapshot of books.balanceSnapshots) {
    const day = dayOf(snapshot.asOf);
    if (day >= input.range.from && day <= input.range.to) days.add(day);
  }
  const lastDay = input.range.to <= today ? input.range.to : today;
  const hasEarlier = books.balanceSnapshots.some((snapshot) => dayOf(snapshot.asOf) <= lastDay);
  if (hasEarlier && lastDay >= input.range.from) days.add(lastDay);

  const points: ValuePoint[] = [];
  let skipped = 0;
  for (const day of [...days].sort()) {
    const snapshots = snapshotsOn(books.balanceSnapshots, day);
    if (snapshots.length === 0) continue;
    const summary = valueBooksHoldings({
      snapshots,
      prices: books.assetPrices,
      assets: books.assets,
      quoteCurrency: input.currency,
      asOf: pricingInstant(day, now),
      rates: books.fxRates,
    });
    if (summary.unpriced.length > 0) {
      skipped += 1;
      continue;
    }
    points.push({ date: day, valueMinor: summary.totalMinor, value: formatMoney(summary.totalMinor, input.currency) });
  }
  return { currency: input.currency, range: input.range, points: points.slice(-MAX_POINTS), skipped };
}

export function valueOverTimeCsv(series: ValueOverTime): string {
  return toCsv(
    INDIVIDUAL_CSV_HEADERS.valueOverTime,
    series.points.map((point) => [point.date, money(point.valueMinor), series.currency]),
  );
}

// -------------------------------------------------------------- File names

export function individualReportFilename(kind: IndividualReportKind, range: DateRange): string {
  switch (kind) {
    case "portfolio":
      return `portfolio-summary-${range.to}.csv`;
    case "activity":
      return `activity-history-${range.from}-to-${range.to}.csv`;
    case "value-over-time":
      return `value-over-time-${range.from}-to-${range.to}.csv`;
    case "pdf":
      return `portfolio-report-${range.from}-to-${range.to}.pdf`;
  }
}
