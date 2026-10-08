/**
 * Bounding what a dashboard table renders. The heavy pages (History, Matching,
 * Journal) otherwise render every row an organization has, so the server-render
 * cost grows without limit — the driver of the Cloudflare resource-limit kills
 * (#232). This slices a full, already-computed collection into one page for
 * display; totals and derived figures are still taken over the full set by the
 * caller. Pure, so the windowing and the `?page=` parsing are tested without a
 * database.
 */

export const PAGE_SIZE = 50;

export interface Page<T> {
  /** The rows for this page only. */
  items: T[];
  /** 1-based, clamped to `[1, pageCount]`. */
  page: number;
  pageCount: number;
  /** Size of the full collection, before windowing. */
  total: number;
  /** 1-based index of the first row shown, or 0 when empty. */
  from: number;
  /** 1-based index of the last row shown, or 0 when empty. */
  to: number;
}

/** A positive page number, defaulting to 1 for anything absent or malformed. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Slice `items` into the requested page. `page` is clamped, so a stale or
 * out-of-range link still renders a valid window rather than an empty table.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const size = Math.max(1, Math.trunc(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pageCount,
    total,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

/**
 * The `?page=` value for a link to `page`, merged over the current query so
 * filters and dates survive navigation. Page 1 omits the parameter.
 */
export function pageHref(base: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
