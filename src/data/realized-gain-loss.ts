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
 * - A sale with no proceeds booked, an unclear split between assets, or no
 *   exchange rate for the sale date is listed as not included, with the
 *   reason. Nothing is guessed, and no market price is used.
 */
import type { Books } from "./books";
import {
  costBasisInputs,
  percentOf,
  type Disposal,
  type DisposalReason,
  type NotIncludedReason,
} from "./gain-loss";

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
}): RealizedGainLoss {
  const asOf = input.now.toISOString();
  const today = asOf.slice(0, 10);
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
    rows,
    notIncluded,
    totals: { proceedsMinor, costMinor, gainMinor, percent: percentOf(gainMinor, costMinor) },
    salesCounted,
  };
}

/** Realized gain / loss for an organization's books. Individuals do not have sales entries and never call this. */
export function holdingsRealizedGainLoss(books: Books, input: { currency: string; now?: Date }): RealizedGainLoss {
  const now = input.now ?? new Date();
  const { disposals, leftAssets } = costBasisInputs(books, input.currency);
  return realizedFromDisposals({ disposals, leftAssets, currency: input.currency, now });
}

// ------------------------------------------------------------- Display

export const REALIZED_COPY = {
  title: "Realized gain / loss",
  description:
    "Sales recorded in the books: what each sale brought in, at the exchange rate on the sale date, against the average cost of the units sold. Simple average cost only: no lots, no holding periods, and no fees beyond what the entries record. Not tax advice.",
  proceedsLabel: "Sale proceeds",
  costLabel: "Cost of units sold",
  gainLabel: "Realized gain / loss",
  emptyMessage: "No sales with proceeds recorded yet.",
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
