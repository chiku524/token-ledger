const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateRange {
  from: string;
  to: string;
}

export function parseDateRange(
  input: { from?: string; to?: string },
  fallback: DateRange,
): { ok: true; range: DateRange } | { ok: false; message: string } {
  const from = input.from?.trim() || fallback.from;
  const to = input.to?.trim() || fallback.to;
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false, message: "Dates must be YYYY-MM-DD." };
  }
  if (from > to) return { ok: false, message: "The start date is after the end date." };
  return { ok: true, range: { from, to } };
}

/** How many days the default window for an individual covers, ending on the latest activity. */
export const DEFAULT_ACTIVITY_DAYS = 30;

/** What a person's connected accounts have reported, as far as a default date range cares. */
export interface ActivityDates {
  sourceTransactions: ReadonlyArray<{ occurredOn: string }>;
  balanceSnapshots: ReadonlyArray<{ asOf: string }>;
  assetPrices: ReadonlyArray<{ asOf: string }>;
}

/** Today's calendar day (UTC) as YYYY-MM-DD. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `day` moved by `days` calendar days (negative for earlier), as YYYY-MM-DD. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return dayOf(new Date(Date.UTC(year, month - 1, date + days)));
}

/**
 * The newest day on which anything was seen: a wallet or exchange movement, a
 * balance reading, or a saved price. A price counts because a value as of an
 * earlier day than the newest price could have nothing to price it with. Days in
 * the future are ignored. Null when nothing has been seen yet.
 */
export function latestActivityDay(books: ActivityDates, now: Date = new Date()): string | null {
  const today = dayOf(now);
  let latest: string | null = null;
  const consider = (value: string) => {
    const day = value.slice(0, 10);
    if (!isIsoDate(day) || day > today) return;
    if (latest === null || day > latest) latest = day;
  };
  for (const transaction of books.sourceTransactions) consider(transaction.occurredOn);
  for (const snapshot of books.balanceSnapshots) consider(snapshot.asOf);
  for (const price of books.assetPrices) consider(price.asOf);
  return latest;
}

/**
 * The range an individual's date pickers show when the address names none: the
 * latest month of activity, meaning the 30 days (inclusive) that end on the
 * newest day with any activity. With no activity yet it is the 30 days ending
 * today. A range picked by the person always replaces this.
 */
export function defaultActivityRange(books: ActivityDates, now: Date = new Date()): DateRange {
  const to = latestActivityDay(books, now) ?? dayOf(now);
  return { from: shiftDay(to, -(DEFAULT_ACTIVITY_DAYS - 1)), to };
}

export function withinRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function rangesOverlap(period: { start: string; end: string }, range: DateRange): boolean {
  return period.start <= range.to && period.end >= range.from;
}

function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
