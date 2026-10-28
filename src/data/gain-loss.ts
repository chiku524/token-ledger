/**
 * Gain / loss on holdings: what the holdings are worth now against what went
 * into them. Pure and database-free, so it is unit-tested directly.
 *
 * Two honest bases, because the two kinds of account keep different records:
 *
 * - "cost" (organizations): the cost comes from the posted books. Each asset
 *   carries an average cost, in the reporting currency, converted at the rate
 *   on the day of each acquisition. Gain / loss is unrealized (nothing is
 *   assumed sold). Simple on purpose: this is not a tax-lot calculation.
 * - "tracked" (individuals): there are no purchase prices, only balances seen
 *   over time. Each time a balance went up or down, that change is counted at
 *   the price on that day. The result is value now minus what was put in
 *   since the first time we saw each balance. It is not a purchase price.
 *
 * An asset with no usable cost or price is never guessed at. It is listed as
 * not included, with the reason.
 */
import {
  findAppliedRate,
  formatMinor,
  HOLDINGS_DISPLAY_FX_FALLBACKS,
  minorToNumber,
  priceAge,
  translateWithRate,
  valueHolding,
  type AssetPrice,
  type FxRate,
} from "@/ledger";
import type { Books, StoredAssetPrice, StoredFxRate } from "./books";
import { holdingsFromSnapshots } from "./valuation";

export type GainLossBasis = "cost" | "tracked";

export type NotIncludedReason = "no-cost" | "no-price" | "no-rate" | "incomplete-history";

/** A change in what is held, with what it cost (or was worth) in the reporting currency. Signed. */
export interface GainLossEvent {
  assetCode: string;
  /** YYYY-MM-DD */
  day: string;
  quantityMinor: bigint;
  costMinor: bigint;
}

/**
 * Why a sale could not be counted as realized gain / loss. Only for organizations.
 * `no-cost-history`: the asset was left out of the cost figures, so its cost cannot be trusted.
 */
export type DisposalReason = "no-proceeds" | "unclear-proceeds" | "no-sale-rate" | "no-cost-history";

/** One posted entry in which more of an asset left than came in, with its cost and (if booked) proceeds. */
export interface Disposal {
  assetCode: string;
  entityId: string;
  reference: string;
  /** YYYY-MM-DD */
  day: string;
  /** Units that left, positive, in the asset's minor units. */
  quantityMinor: bigint;
  /** Average cost of those units, in the reporting currency. */
  costMinor: bigint;
  /** What the entry booked as received, in the reporting currency at the sale date's rate. Null when not counted. */
  proceedsMinor: bigint | null;
  /** Why proceeds are null. */
  reason: DisposalReason | null;
}

export interface GainLossNotIncluded {
  assetCode: string;
  reason: NotIncludedReason;
  /** The quantity left out, when known. */
  quantityMinor: bigint | null;
}

export interface GainLossRow {
  assetCode: string;
  quantityMinor: bigint;
  valueMinor: bigint;
  investedMinor: bigint;
  gainMinor: bigint;
  /** Percent of what was put in, two decimals. Null when nothing is left to compare against. */
  percent: number | null;
  /** The price used is more than a day old. */
  stale: boolean;
}

export interface GainLossPoint {
  day: string;
  valueMinor: bigint;
  investedMinor: bigint;
  gainMinor: bigint;
}

export interface GainLossTotals {
  valueMinor: bigint;
  investedMinor: bigint;
  gainMinor: bigint;
  percent: number | null;
}

export interface GainLoss {
  basis: GainLossBasis;
  currency: string;
  asOf: string;
  rows: GainLossRow[];
  notIncluded: GainLossNotIncluded[];
  totals: GainLossTotals;
  /** Value against what went in, over time. Empty when prices are too thin to draw a line. */
  series: GainLossPoint[];
  /** Days left out of the series because a held asset had no recent price. */
  skippedDays: number;
  /** At least one price in the totals is more than a day old. */
  stale: boolean;
}

const MONEY_SCALE = 2;
/** A history point is only drawn from a price no older than this. */
const SERIES_STALENESS_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_SERIES_POINTS = 180;

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** The pricing instant for a calendar day: its end, but never in the future. */
function pricingInstant(day: string, now: Date): string {
  const endOfDay = Date.parse(`${day}T23:59:59.999Z`);
  return new Date(Math.min(endOfDay, now.getTime())).toISOString();
}

/** Integer division, rounded half up, for a non-negative numerator and a positive denominator. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
}

export function percentOf(gainMinor: bigint, investedMinor: bigint): number | null {
  if (investedMinor <= 0n) return null;
  return Number((gainMinor * 10000n) / investedMinor) / 100;
}

function totalsOf(rows: readonly GainLossRow[]): GainLossTotals {
  let valueMinor = 0n;
  let investedMinor = 0n;
  for (const row of rows) {
    valueMinor += row.valueMinor;
    investedMinor += row.investedMinor;
  }
  const gainMinor = valueMinor - investedMinor;
  return { valueMinor, investedMinor, gainMinor, percent: percentOf(gainMinor, investedMinor) };
}

// ------------------------------------------------------------------ Compute

/**
 * Value now, cost, and gain / loss per asset, plus the line over time.
 * `events` are the signed changes in quantity and cost; `notIncluded` are the
 * assets the caller already ruled out.
 */
export function computeGainLoss(input: {
  basis: GainLossBasis;
  events: readonly GainLossEvent[];
  notIncluded?: readonly GainLossNotIncluded[];
  assets: readonly { code: string; decimals: number }[];
  prices: readonly StoredAssetPrice[];
  rates?: readonly StoredFxRate[];
  currency: string;
  now: Date;
}): GainLoss {
  const decimals = new Map(input.assets.map((asset) => [asset.code, asset.decimals]));
  const prices = input.prices as readonly AssetPrice[];
  const rates = input.rates as readonly FxRate[] | undefined;
  const asOf = input.now.toISOString();
  const today = dayOf(asOf);

  const eventsByAsset = new Map<string, GainLossEvent[]>();
  for (const event of input.events) {
    const list = eventsByAsset.get(event.assetCode) ?? [];
    list.push(event);
    eventsByAsset.set(event.assetCode, list);
  }

  const position = (assetCode: string, day: string) => {
    let quantityMinor = 0n;
    let costMinor = 0n;
    for (const event of eventsByAsset.get(assetCode) ?? []) {
      if (event.day > day) continue;
      quantityMinor += event.quantityMinor;
      costMinor += event.costMinor;
    }
    return { quantityMinor, costMinor };
  };

  const price = (assetCode: string, quantityMinor: bigint, instant: string, stalenessMs?: number) =>
    valueHolding({
      prices,
      assetCode,
      quantityMinor,
      quantityScale: decimals.get(assetCode) ?? 0,
      quoteCurrency: input.currency,
      asOf: instant,
      rates,
      stalenessMs,
    });

  const rows: GainLossRow[] = [];
  const notIncluded: GainLossNotIncluded[] = [...(input.notIncluded ?? [])];

  for (const assetCode of [...eventsByAsset.keys()].sort()) {
    const { quantityMinor, costMinor } = position(assetCode, today);
    // Nothing held now: nothing to compare. (A sale is not counted here.)
    if (quantityMinor <= 0n) continue;
    const priced = price(assetCode, quantityMinor, asOf);
    if (!priced) {
      notIncluded.push({ assetCode, reason: "no-price", quantityMinor });
      continue;
    }
    const gainMinor = priced.valueMinor - costMinor;
    rows.push({
      assetCode,
      quantityMinor,
      valueMinor: priced.valueMinor,
      investedMinor: costMinor,
      gainMinor,
      percent: percentOf(gainMinor, costMinor),
      stale: priced.age !== "fresh",
    });
  }

  const counted = rows.map((row) => row.assetCode);
  const series: GainLossPoint[] = [];
  let skippedDays = 0;
  if (counted.length > 0) {
    const firstDay = counted
      .flatMap((assetCode) => (eventsByAsset.get(assetCode) ?? []).map((event) => event.day))
      .reduce((earliest, day) => (day < earliest ? day : earliest), today);
    const days = new Set<string>();
    for (const assetCode of counted) for (const event of eventsByAsset.get(assetCode) ?? []) days.add(event.day);
    for (const stored of input.prices) {
      if (counted.includes(stored.assetCode)) days.add(dayOf(stored.asOf));
    }
    days.add(today);
    const candidates = [...days].filter((day) => day >= firstDay && day <= today).sort().slice(-MAX_SERIES_POINTS);

    for (const day of candidates) {
      const instant = pricingInstant(day, input.now);
      let valueMinor = 0n;
      let investedMinor = 0n;
      let complete = true;
      for (const assetCode of counted) {
        const held = position(assetCode, day);
        if (held.quantityMinor <= 0n) continue;
        const priced = price(assetCode, held.quantityMinor, instant, SERIES_STALENESS_MS);
        if (!priced || priceAge(priced, instant, SERIES_STALENESS_MS) !== "fresh") {
          complete = false;
          break;
        }
        valueMinor += priced.valueMinor;
        investedMinor += held.costMinor;
      }
      if (!complete) {
        skippedDays += 1;
        continue;
      }
      series.push({ day, valueMinor, investedMinor, gainMinor: valueMinor - investedMinor });
    }
  }

  return {
    basis: input.basis,
    currency: input.currency,
    asOf,
    rows,
    notIncluded,
    totals: totalsOf(rows),
    series,
    skippedDays,
    stale: rows.some((row) => row.stale),
  };
}

// ----------------------------------------------------- Organizations: cost

export function convertToCurrency(
  amountMinor: bigint,
  from: string,
  to: string,
  day: string,
  rates: readonly StoredFxRate[],
): bigint | null {
  if (from === to) return amountMinor;
  const applied =
    findAppliedRate(rates as readonly FxRate[], from, to, day) ??
    findAppliedRate(HOLDINGS_DISPLAY_FX_FALLBACKS, from, to, day);
  return applied ? translateWithRate(amountMinor, applied, MONEY_SCALE) : null;
}

/**
 * Average-cost events from the posted books, in the reporting currency.
 *
 * Only lines on accounts that carry digital assets, with a quantity, count.
 * Per entry and asset, quantities in and out are netted first, so moving an
 * asset between wallets changes nothing. Cost is added at the amount booked,
 * converted at the rate on the entry date. A decrease removes the running
 * average cost. An asset whose history cannot be followed (no rate for a
 * date, or more leaving than ever came in) is left out, with the reason.
 */
export function costBasisInputs(
  books: Books,
  currency: string,
): {
  events: GainLossEvent[];
  notIncluded: GainLossNotIncluded[];
  disposals: Disposal[];
  /** Assets whose cost history could not be followed, with the reason. */
  leftAssets: ReadonlyMap<string, NotIncludedReason>;
} {
  const carrying = new Set(
    books.accounts.filter((account) => account.measurementBasis !== null).map((account) => `${account.entityId}|${account.code}`),
  );
  const normalBalance = new Map(books.accounts.map((account) => [`${account.entityId}|${account.code}`, account.normalBalance]));
  const assetAccounts = new Set(
    books.accounts.filter((account) => account.type === "asset").map((account) => `${account.entityId}|${account.code}`),
  );
  const entries = [...books.journalEntries].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.reference.localeCompare(b.reference) || a.id.localeCompare(b.id),
  );

  const running = new Map<string, { quantityMinor: bigint; costMinor: bigint }>();
  const events: GainLossEvent[] = [];
  const disposals: Disposal[] = [];
  const left = new Map<string, NotIncludedReason>();

  for (const entry of entries) {
    const perAsset = new Map<string, { inQty: bigint; outQty: bigint; inCost: bigint; ok: boolean; reason: NotIncludedReason }>();
    for (const line of entry.lines) {
      const key = `${entry.entityId}|${line.accountCode}`;
      if (!carrying.has(key)) continue;
      if (!line.assetCode || line.quantityMinor === undefined || !line.quantityDirection) continue;
      const group = perAsset.get(line.assetCode) ?? { inQty: 0n, outQty: 0n, inCost: 0n, ok: true, reason: "no-cost" as NotIncludedReason };
      if (line.quantityDirection === "out") {
        group.outQty += line.quantityMinor;
      } else {
        group.inQty += line.quantityMinor;
        const signed = line.side === normalBalance.get(key) ? line.amountMinor : -line.amountMinor;
        const converted = convertToCurrency(signed, line.currency, currency, entry.entryDate, books.fxRates);
        if (converted === null) {
          group.ok = false;
          group.reason = "no-rate";
        } else {
          group.inCost += converted;
        }
      }
      perAsset.set(line.assetCode, group);
    }

    const decreasing = [...perAsset.values()].filter((group) => group.inQty - group.outQty < 0n).length;
    /** What an entry booked as received for something that left: a debit on an asset account that is not the one sold. */
    const proceedsFor = (assetCode: string): bigint => {
      let total = 0n;
      for (const line of entry.lines) {
        const key = `${entry.entityId}|${line.accountCode}`;
        if (line.side !== "debit" || !assetAccounts.has(key)) continue;
        if (carrying.has(key)) {
          // Another asset coming in (a swap). Same asset, or no quantity (a revaluation), is not a sale price.
          if (!line.assetCode || line.assetCode === assetCode || line.quantityDirection !== "in") continue;
        }
        total += line.amountMinor;
      }
      return total;
    };

    /** A sale of an asset whose cost cannot be followed: kept only so it can be listed as left out. */
    const untrustedSale = (assetCode: string, quantityMinor: bigint) =>
      disposals.push({ assetCode, entityId: entry.entityId, reference: entry.reference, day: entry.entryDate, quantityMinor, costMinor: 0n, proceedsMinor: null, reason: "no-cost-history" });

    for (const [assetCode, group] of perAsset) {
      if (left.has(assetCode)) {
        if (group.inQty - group.outQty < 0n) untrustedSale(assetCode, group.outQty - group.inQty);
        continue;
      }
      const net = group.inQty - group.outQty;
      if (net === 0n) continue; // a move between wallets
      const runKey = `${entry.entityId}|${assetCode}`;
      const state = running.get(runKey) ?? { quantityMinor: 0n, costMinor: 0n };
      if (net > 0n) {
        if (!group.ok) {
          left.set(assetCode, group.reason);
          continue;
        }
        if (group.inCost <= 0n) {
          left.set(assetCode, "no-cost");
          continue;
        }
        const cost = divideRounded(group.inCost * net, group.inQty);
        state.quantityMinor += net;
        state.costMinor += cost;
        events.push({ assetCode, day: entry.entryDate, quantityMinor: net, costMinor: cost });
      } else {
        const out = -net;
        if (state.quantityMinor <= 0n || out > state.quantityMinor) {
          left.set(assetCode, "incomplete-history");
          untrustedSale(assetCode, out);
          continue;
        }
        const removed = out === state.quantityMinor ? state.costMinor : divideRounded(state.costMinor * out, state.quantityMinor);
        state.quantityMinor -= out;
        state.costMinor -= removed;
        events.push({ assetCode, day: entry.entryDate, quantityMinor: -out, costMinor: -removed });

        let proceedsMinor: bigint | null = null;
        let reason: DisposalReason | null = null;
        const booked = proceedsFor(assetCode);
        if (decreasing > 1) {
          reason = "unclear-proceeds";
        } else if (booked <= 0n) {
          reason = "no-proceeds";
        } else {
          const converted = convertToCurrency(booked, entry.currency, currency, entry.entryDate, books.fxRates);
          if (converted === null) reason = "no-sale-rate";
          else proceedsMinor = converted;
        }
        disposals.push({ assetCode, entityId: entry.entityId, reference: entry.reference, day: entry.entryDate, quantityMinor: out, costMinor: removed, proceedsMinor, reason });
      }
      running.set(runKey, state);
    }
  }

  const observed = new Map(holdingsFromSnapshots(books.balanceSnapshots).map((holding) => [holding.assetCode, holding.quantityMinor]));
  const kept = events.filter((event) => !left.has(event.assetCode));
  const booked = new Map<string, bigint>();
  for (const event of kept) booked.set(event.assetCode, (booked.get(event.assetCode) ?? 0n) + event.quantityMinor);

  const notIncluded: GainLossNotIncluded[] = [];
  for (const [assetCode, reason] of left) {
    const quantityMinor = observed.get(assetCode) ?? null;
    notIncluded.push({ assetCode, reason, quantityMinor: quantityMinor !== null && quantityMinor > 0n ? quantityMinor : null });
  }
  // Seen on chain, but with no (or not enough) cost in the books.
  for (const [assetCode, observedQty] of observed) {
    if (left.has(assetCode) || observedQty <= 0n) continue;
    const covered = booked.get(assetCode) ?? 0n;
    const uncovered = observedQty - (covered > 0n ? covered : 0n);
    if (uncovered > 0n) notIncluded.push({ assetCode, reason: "no-cost", quantityMinor: uncovered });
  }
  notIncluded.sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  return { events: kept, notIncluded, disposals, leftAssets: left };
}

// ------------------------------------------------- Individuals: tracked

/**
 * Events from the balances seen over time. Each increase or decrease in a
 * source's balance is counted at the price on that day. An asset with no
 * price on a day its balance changed is left out: it is not valued by guess.
 */
export function trackedInputs(
  books: Books,
  currency: string,
  now: Date,
): { events: GainLossEvent[]; notIncluded: GainLossNotIncluded[] } {
  const decimals = new Map(books.assets.map((asset) => [asset.code, asset.decimals]));
  const bySource = new Map<string, Books["balanceSnapshots"]>();
  for (const snapshot of books.balanceSnapshots) {
    const key = `${snapshot.sourceId}|${snapshot.assetCode}`;
    bySource.set(key, [...(bySource.get(key) ?? []), snapshot]);
  }

  const events: GainLossEvent[] = [];
  const left = new Set<string>();
  for (const snapshots of bySource.values()) {
    const ordered = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
    let previous = 0n;
    for (const snapshot of ordered) {
      const delta = snapshot.quantityMinor - previous;
      previous = snapshot.quantityMinor;
      if (delta === 0n || left.has(snapshot.assetCode)) continue;
      const day = dayOf(snapshot.asOf);
      const priced = valueHolding({
        prices: books.assetPrices as readonly AssetPrice[],
        assetCode: snapshot.assetCode,
        quantityMinor: delta < 0n ? -delta : delta,
        quantityScale: decimals.get(snapshot.assetCode) ?? 0,
        quoteCurrency: currency,
        asOf: pricingInstant(day, now),
        rates: books.fxRates as readonly FxRate[],
      });
      if (!priced) {
        left.add(snapshot.assetCode);
        continue;
      }
      events.push({
        assetCode: snapshot.assetCode,
        day,
        quantityMinor: delta,
        costMinor: delta < 0n ? -priced.valueMinor : priced.valueMinor,
      });
    }
  }

  const observed = new Map(holdingsFromSnapshots(books.balanceSnapshots).map((holding) => [holding.assetCode, holding.quantityMinor]));
  const notIncluded: GainLossNotIncluded[] = [...left]
    .map((assetCode) => ({
      assetCode,
      reason: "no-price" as const,
      quantityMinor: (observed.get(assetCode) ?? 0n) > 0n ? (observed.get(assetCode) ?? null) : null,
    }))
    .sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  return { events: events.filter((event) => !left.has(event.assetCode)), notIncluded };
}

// ------------------------------------------------------------ One call

/** Gain / loss for a set of books: average cost for an organization, tracked flows for an individual. */
export function holdingsGainLoss(
  books: Books,
  input: { individual: boolean; currency: string; now?: Date },
): GainLoss {
  const now = input.now ?? new Date();
  const basis: GainLossBasis = input.individual ? "tracked" : "cost";
  const { events, notIncluded } = input.individual
    ? trackedInputs(books, input.currency, now)
    : costBasisInputs(books, input.currency);
  return computeGainLoss({
    basis,
    events,
    notIncluded,
    assets: books.assets,
    prices: books.assetPrices,
    rates: books.fxRates,
    currency: input.currency,
    now,
  });
}

// ------------------------------------------------------------- Display

/** "+USD 1,234.00", "-USD 12.00", or "USD 0.00". */
export function signedMoney(amountMinor: bigint, currency: string): string {
  const body = `${currency} ${formatMinor(amountMinor < 0n ? -amountMinor : amountMinor, MONEY_SCALE, { minFraction: 2, maxFraction: 2 })}`;
  if (amountMinor > 0n) return `+${body}`;
  if (amountMinor < 0n) return `-${body}`;
  return body;
}

/** "USD 1,234.00" or "-USD 12.00": an amount, not a change. */
export function moneyText(amountMinor: bigint, currency: string): string {
  const body = `${currency} ${formatMinor(amountMinor < 0n ? -amountMinor : amountMinor, MONEY_SCALE, { minFraction: 2, maxFraction: 2 })}`;
  return amountMinor < 0n ? `-${body}` : body;
}

export function signedPercent(percent: number | null): string {
  if (percent === null) return "n/a";
  const body = `${Math.abs(percent).toFixed(2)}%`;
  return percent > 0 ? `+${body}` : percent < 0 ? `-${body}` : body;
}

export type GainLossDirection = "gain" | "loss" | "even";

export function directionOf(gainMinor: bigint): GainLossDirection {
  return gainMinor > 0n ? "gain" : gainMinor < 0n ? "loss" : "even";
}

const DIRECTION_WORD: Record<GainLossDirection, string> = { gain: "Gain", loss: "Loss", even: "No change" };

export function directionWord(gainMinor: bigint): string {
  return DIRECTION_WORD[directionOf(gainMinor)];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function axisDay(day: string): string {
  const month = Number(day.slice(5, 7));
  return `${Number(day.slice(8, 10))} ${MONTHS[month - 1] ?? ""}`.trim();
}

export interface GainLossCopy {
  title: string;
  description: string;
  valueLabel: string;
  investedLabel: string;
  gainLabel: string;
  lineTitle: string;
  barsTitle: string;
  emptyTitle: string;
  emptyMessage: string;
}

/** The words for each audience. The individual wording avoids accounting terms. */
export function gainLossCopy(basis: GainLossBasis): GainLossCopy {
  if (basis === "tracked") {
    return {
      title: "Gain / loss",
      description:
        "What your holdings are worth now compared with what you put in. Each time a balance changed, it is counted at that day's price, starting from the first time we saw it. This is not your purchase price.",
      valueLabel: "Value now",
      investedLabel: "Put in",
      gainLabel: "Gain / loss",
      lineTitle: "Value now and what you put in, over time",
      barsTitle: "Gain / loss by asset",
      emptyTitle: "No gain or loss to show yet",
      emptyMessage: "Add a wallet and refresh prices. Gain / loss appears once a balance and its price are both known.",
    };
  }
  return {
    title: "Holdings gain / loss",
    description:
      "Unrealized: what the counted holdings are worth now against what the books say they cost. Cost is the average per asset in the reporting currency, converted at the rate on each acquisition date. Nothing is assumed sold. Not tax advice.",
    valueLabel: "Value now",
    investedLabel: "Cost",
    gainLabel: "Unrealized gain / loss",
    lineTitle: "Value now against cost, over time",
    barsTitle: "Unrealized gain / loss by asset",
    emptyTitle: "No gain or loss to show yet",
    emptyMessage: "Post acquisitions with an amount and quantity, and refresh prices. Gain / loss appears once an asset has both a cost and a price.",
  };
}

const REASON_TEXT: Record<"cost" | "tracked", Record<NotIncludedReason, string>> = {
  cost: {
    "no-cost": "not included: no cost data",
    "no-price": "not included: no price yet",
    "no-rate": "not included: no exchange rate for an acquisition date",
    "incomplete-history": "not included: the books show more leaving than coming in",
  },
  tracked: {
    "no-cost": "not included: no starting value",
    "no-price": "not included: no price on the day its balance changed",
    "no-rate": "not included: no exchange rate",
    "incomplete-history": "not included: its history is incomplete",
  },
};

export function notIncludedText(basis: GainLossBasis, reason: NotIncludedReason): string {
  return REASON_TEXT[basis][reason];
}

export interface GainLossLinePoint {
  id: string;
  label: string;
  axisLabel: string;
  value: number;
  invested: number;
  gain: number;
  valueText: string;
  investedText: string;
  gainText: string;
}

/** The series shaped for the line chart. Needs two or more points to be a line. */
export function gainLossLinePoints(gainLoss: GainLoss): GainLossLinePoint[] {
  return gainLoss.series.map((point) => ({
    id: point.day,
    label: point.day,
    axisLabel: axisDay(point.day),
    value: minorToNumber(point.valueMinor, MONEY_SCALE),
    invested: minorToNumber(point.investedMinor, MONEY_SCALE),
    gain: minorToNumber(point.gainMinor, MONEY_SCALE),
    valueText: moneyText(point.valueMinor, gainLoss.currency),
    investedText: moneyText(point.investedMinor, gainLoss.currency),
    gainText: `${directionWord(point.gainMinor)} ${signedMoney(point.gainMinor, gainLoss.currency)}`,
  }));
}

export interface GainLossBarRow {
  id: string;
  label: string;
  /** Signed, in whole currency units. Positive draws as a gain. */
  value: number;
  formatted: string;
  detail: string;
}

/** One bar per asset: its gain or loss in the reporting currency. */
export function gainLossBarRows(gainLoss: GainLoss): GainLossBarRow[] {
  return gainLoss.rows.map((row) => ({
    id: row.assetCode,
    label: row.assetCode,
    value: minorToNumber(row.gainMinor, MONEY_SCALE),
    formatted: `${directionWord(row.gainMinor)} ${signedMoney(row.gainMinor, gainLoss.currency)} (${signedPercent(row.percent)})`,
    detail: `Value now ${moneyText(row.valueMinor, gainLoss.currency)}`,
  }));
}