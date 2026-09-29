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
