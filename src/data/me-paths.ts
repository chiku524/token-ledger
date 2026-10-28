/**
 * The address of the individual's area.
 *
 * A person lives under `/me`; an organization under `/dashboard`. They are two
 * addresses for one set of pages: the proxy serves `/me/...` from the matching
 * `/dashboard/...` page, and a page opened at the wrong address for the account
 * type is redirected to the right one (see `auth/account-home.ts`). So each
 * section is written once, and a person's URLs read in their own words:
 * `/me/holdings`, `/me/activity`, `/me/history`, `/me/people`.
 *
 * Pure and import-free so the client nav, the proxy and the server guards can
 * all share it.
 */
import { DEFAULT_ORGANIZATION_ACCOUNT_TYPE, type OrganizationAccountType } from "./account-type";

/** The header the proxy sets to the address the browser asked for, before any rewrite. Always overwritten, never trusted from the client. */
export const REQUEST_PATH_HEADER = "x-token-ledger-path";

export const ME_BASE = "/me";
export const DASHBOARD_BASE = "/dashboard";

/** `[dashboard segment, /me segment]` for the sections whose name differs. */
const RENAMED: readonly (readonly [string, string])[] = [
  ["sources", "holdings"],
  ["ledger", "activity"],
  ["audit", "history"],
  ["users", "people"],
];

/** Split `/path?query#hash` into the path and the rest, untouched. */
function split(href: string): [string, string] {
  const match = /^([^?#]*)(.*)$/s.exec(href);
  return [match?.[1] ?? href, match?.[2] ?? ""];
}

function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/** Whether `href` (a path, optionally with a query or hash) is in the individual's area. */
export function isMePath(href: string): boolean {
  return under(split(href)[0], ME_BASE);
}

/** Whether `href` is in the organization dashboard. */
export function isDashboardPath(href: string): boolean {
  return under(split(href)[0], DASHBOARD_BASE);
}

function swap(href: string, from: string, to: string, pairs: readonly (readonly [string, string])[]): string {
  const [path, rest] = split(href);
  const tail = path.slice(from.length);
  const [, segment = "", ...more] = tail.split("/");
  const found = pairs.find(([source]) => source === segment);
  const renamed = found ? found[1] : segment;
  const next = segment === "" ? "" : `/${[renamed, ...more].join("/")}`;
  return `${to}${next}${rest}`;
}

/** `/dashboard/sources?x=1` as the individual's address: `/me/holdings?x=1`. Anything else is returned as given. */
export function mePath(href: string): string {
  if (!isDashboardPath(href)) return href;
  return swap(href, DASHBOARD_BASE, ME_BASE, RENAMED);
}

/** The inverse of `mePath`: `/me/holdings` as `/dashboard/sources`. Anything else is returned as given. */
export function dashboardPath(href: string): string {
  if (!isMePath(href)) return href;
  return swap(
    href,
    ME_BASE,
    DASHBOARD_BASE,
    RENAMED.map(([dashboard, me]) => [me, dashboard] as const),
  );
}

/**
 * The address to use for `href` on an account of this type: the `/me` form for
 * an individual, the `/dashboard` form for anything else. Addresses outside both
 * areas (`/sign-in`, an external link) are returned as given.
 */
export function pathFor(accountType: OrganizationAccountType | undefined, href: string): string {
  const individual = (accountType ?? DEFAULT_ORGANIZATION_ACCOUNT_TYPE) === "individual";
  return individual ? mePath(href) : dashboardPath(href);
}
