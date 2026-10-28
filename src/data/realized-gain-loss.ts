/**
 * Realized gain / loss for organizations: what sales actually brought in,
 * against the average cost of the units that were sold. Pure and
 * database-free, so it is unit-tested directly.
 *
 * Simple on purpose, and not tax-grade: no lots, no holding periods, and no
 * fees beyond what the entries themselves record.
 *
 * - Cost of the units sold is the running average cost per asset, in the
 *   reporting currency (the same figure the unrealized side uses).
 * - Proceeds are what the sale entry booked as received (cash, or another
 *   asset coming in), converted to the reporting currency at the rate on the
 *   sale date.
 * - Only sales dated inside the chosen range count. The cost of what was sold
 *   still comes from every earlier purchase, so a range never changes the
 *   average cost. The default range is All time.
 * - A sale with no proceeds booked, an unclear split between assets, or no
 *   exchange rate for the sale date is listed as not included, with the
 *   reason. Nothing is guessed, and no market price is used.
 */
import type { Books } from "./books";
import { parseDateRange, shiftDay } from "./period";
import {
  costBasisInputs,
  percentOf,
  type Disposal,
  type DisposalReason,
  type NotIncludedReason,
} from "./gain-loss";

export type RealizedPreset = "ytd" | "12m" | "all";

/** The dates a realized gain / loss figure covers. A null `from` means from the first sale. */
export interface RealizedRange {
  /** A preset, or "custom" for dates picked by hand. */
  key: RealizedPreset | "custom";
  /** YYYY-MM-DD, inclusive. */
  from: string | null;
  /** YYYY-MM-DD, inclusive. Sales after today never count whatever this says. */
  to: string;
}

export const REALIZED_PRESETS: ReadonlyArray<{ key: RealizedPreset; label: string }> = [
  { key: "ytd", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

/** Realized gain / loss opens on All time: it is a running total, not a view of recent activity. */
export const DEFAULT_REALIZED_PRESET: RealizedPreset = "all";

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The same calendar day one year earlier, moved forward a day: twelve months, both ends included. */
function twelveMonthsFrom(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  const sameDayLastYear = new Date(Date.UTC(year - 1, month - 1, Math.min(date, lastDay))).toISOString().slice(0, 10);
  return shiftDay(sameDayLastYear, 1);
}

export function presetRange(key: RealizedPreset, now: Date = new Date()): RealizedRange {
  const to = today(now);
  if (key === "ytd") return { key, from: `${to.slice(0, 4)}-01-01`, to };
  if (key === "12m") return { key, from: twelveMonthsFrom(to), to };
  return { key: "all", from: null, to };
}

/**
 * The range for a page address: `from` and `to` (the date pickers, as elsewhere in the app)
 * win; otherwise `range` names a preset; otherwise All time. Dates that are not real
 * dates, or a start after the end, fall back to All time with a message.
 */
export function resolveRealizedRange(
  input: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): { range: RealizedRange; error: string | null } {
  const to = today(now);
  const from = input.from?.trim();
  const end = input.to?.trim();
  if (from || end) {
    const parsed = parseDateRange({ from: from || "1970-01-01", to: end || to }, { from: "1970-01-01", to });
    if (!parsed.ok) return { range: presetRange(DEFAULT_REALIZED_PRESET, now), error: parsed.message };
    return { range: { key: "custom", from: from ? parsed.range.from : null, to: parsed.range.to }, error: null };
  }
  const preset = REALIZED_PRESETS.find((item) => item.key === input.range)?.key ?? DEFAULT_REALIZED_PRESET;
  return { range: presetRange(preset, now), error: null };
}

/** The address part that keeps a range, with no leading separator. Empty for the default. */
export function realizedRangeQuery(range: RealizedRange): string {
  if (range.key === DEFAULT_REALIZED_PRESET) return "";
  if (range.key === "custom") return `from=${range.from ?? ""}&to=${range.to}`;
  return `range=${range.key}`;
}

export function describeRealizedRange(range: RealizedRange): string {
  if (range.key === "all") return `All time, up to ${range.to}`;
  const label = REALIZED_PRESETS.find((item) => item.key === range.key)?.label;
  const dates = range.from ? `${range.from} to ${range.to}` : `up to ${range.to}`;
  return label ? `${label}: ${dates}` : `Custom: ${dates}`;
}

export interface RealizedRow {
  assetCode: string;
  /** Number of sales counted. */
  sales: number;
  quantityMinor: bigint;
  proceedsMinor: bigint;
  costMinor: bigint;
  gainMinor: bigint;
  /** Percent of the cost of what was sold, two decimals. Null when there is no cost to compare against. */
  percent: number | null;
}

export interface RealizedNotIncluded {
  assetCode: string;
  reason: DisposalReason;
  /** Number of sales left out for this reason. */
  sales: number;
}

export interface RealizedTotals {
  proceedsMinor: bigint;
  costMinor: bigint;
  gainMinor: bigint;
  percent: number | null;
}

export interface RealizedGainLoss {
  currency: string;
  asOf: string;
  /** The dates the figures cover. */
  range: RealizedRange;
  /** The day of the earliest sale in the books, counted or not. Null when there is none. */
  earliestSaleDay: string | null;
  rows: RealizedRow[];
  notIncluded: RealizedNotIncluded[];
  totals: RealizedTotals;
  /** Sales counted in the totals. */
  salesCounted: number;
}

/** Realized gain / loss from the disposals of one set of books, in one reporting currency. */
export function realizedFromDisposals(input: {
  disposals: readonly Disposal[];
  /** Assets whose cost history could not be followed: their sales cannot be trusted. */
  leftAssets: ReadonlyMap<string, NotIncludedReason>;
  currency: string;
  now: Date;
  /** Defaults to All time. */
  range?: RealizedRange;
}): RealizedGainLoss {
  const asOf = input.now.toISOString();
  const today = asOf.slice(0, 10);
  const range = input.range ?? presetRange("all", input.now);
  const last = range.to < today ? range.to : today;
  let earliestSaleDay: string | null = null;
  const byAsset = new Map<string, RealizedRow>();
  const out = new Map<string, RealizedNotIncluded>();
  let salesCounted = 0;

  const leave = (assetCode: string, reason: DisposalReason) => {
    const key = `${assetCode}|${reason}`;
    const existing = out.get(key);
    if (existing) existing.sales += 1;
    else out.set(key, { assetCode, reason, sales: 1 });
  };

  for (const disposal of input.disposals) {
    if (disposal.day > today) continue;
    if (earliestSaleDay === null || disposal.day < earliestSaleDay) earliestSaleDay = disposal.day;
    if (disposal.day > last || (range.from !== null && disposal.day < range.from)) continue;
    if (input.leftAssets.has(disposal.assetCode)) {
      leave(disposal.assetCode, "no-cost-history");
      continue;
    }
    if (disposal.proceedsMinor === null) {
      leave(disposal.assetCode, disposal.reason ?? "no-proceeds");
      continue;
    }
    const row = byAsset.get(disposal.assetCode) ?? {
      assetCode: disposal.assetCode,
      sales: 0,
      quantityMinor: 0n,
      proceedsMinor: 0n,
      costMinor: 0n,
      gainMinor: 0n,
      percent: null,
    };
    row.sales += 1;
    row.quantityMinor += disposal.quantityMinor;
    row.proceedsMinor += disposal.proceedsMinor;
    row.costMinor += disposal.costMinor;
    row.gainMinor = row.proceedsMinor - row.costMinor;
    byAsset.set(disposal.assetCode, row);
    salesCounted += 1;
  }

  const rows = [...byAsset.values()]
    .map((row) => ({ ...row, percent: percentOf(row.gainMinor, row.costMinor) }))
    .sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  let proceedsMinor = 0n;
  let costMinor = 0n;
  for (const row of rows) {
    proceedsMinor += row.proceedsMinor;
    costMinor += row.costMinor;
  }
  const gainMinor = proceedsMinor - costMinor;
  const notIncluded = [...out.values()].sort(
    (a, b) => a.assetCode.localeCompare(b.assetCode) || a.reason.localeCompare(b.reason),
  );

  return {
    currency: input.currency,
    asOf,
    range,
    earliestSaleDay,
    rows,
    notIncluded,
    totals: { proceedsMinor, costMinor, gainMinor, percent: percentOf(gainMinor, costMinor) },
    salesCounted,
  };
}

/** Realized gain / loss for an organization's books. Individuals do not have sales entries and never call this. */
export function holdingsRealizedGainLoss(books: Books, input: { currency: string; now?: Date; range?: RealizedRange }): RealizedGainLoss {
  const now = input.now ?? new Date();
  const { disposals, leftAssets } = costBasisInputs(books, input.currency);
  return realizedFromDisposals({ disposals, leftAssets, currency: input.currency, now, range: input.range });
}

// ------------------------------------------------------------- Display

export const REALIZED_COPY = {
  title: "Realized gain / loss",
  rangeNote:
    "Only sales dated inside the chosen dates count. Their cost still comes from every earlier purchase. The unrealized figures above are always as of now.",
  description:
    "Sales recorded in the books: what each sale brought in, at the exchange rate on the sale date, against the average cost of the units sold. Simple average cost only: no lots, no holding periods, and no fees beyond what the entries record. Not tax advice.",
  proceedsLabel: "Sale proceeds",
  costLabel: "Cost of units sold",
  gainLabel: "Realized gain / loss",
  emptyMessage: "No sales with proceeds recorded yet.",
  emptyInRangeMessage: "No sales with proceeds recorded in these dates.",
  rangeLabel: "Realized gain / loss dates",
  leftOutTitle: "Sales left out of realized gain / loss",
} as const;

const REALIZED_REASON_TEXT: Record<DisposalReason, string> = {
  "no-proceeds": "not included: no sale proceeds recorded in the entry",
  "unclear-proceeds": "not included: several assets left in one entry, so the proceeds cannot be split",
  "no-sale-rate": "not included: no exchange rate for the sale date",
  "no-cost-history": "not included: its cost could not be worked out from the books",
};

export function realizedNotIncludedText(reason: DisposalReason, sales: number): string {
  return `${REALIZED_REASON_TEXT[reason]}${sales > 1 ? ` (${sales} sales)` : ""}`;
}
