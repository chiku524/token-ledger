/**
 * The onboarding role's hidden navigation sections. Pure helpers only, so both
 * the server (which reads the stored selection) and the client nav (which needs
 * the catalog and the rule to filter links) can import this without pulling in a
 * database. See `./onboarding` for the persistence.
 */
import type { Role } from "@/auth/roles";

/** A nav section that can be hidden from the onboarding role. */
export interface OnboardingSection {
  href: string;
  label: string;
}

/**
 * Every dashboard nav section except Overview and Settings, which stay visible
 * so an onboarding user always has a home and an account page. This is the set
 * an operator can toggle; an href absent here is never hideable.
 */
export const ONBOARDING_SECTIONS: readonly OnboardingSection[] = [
  { href: "/dashboard/entities", label: "Companies" },
  { href: "/dashboard/sources", label: "Holdings" },
  { href: "/dashboard/guide", label: "Guide" },
  { href: "/dashboard/ledger", label: "Journal" },
  { href: "/dashboard/approvals", label: "Approvals" },
  { href: "/dashboard/reconciliation", label: "Matching" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/treasury", label: "Treasury" },
  { href: "/dashboard/payables", label: "Payables" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/consolidation", label: "Combined" },
  { href: "/dashboard/operations", label: "Operations" },
  { href: "/dashboard/audit", label: "History" },
];

const HIDEABLE = new Set(ONBOARDING_SECTIONS.map((section) => section.href));

/** Hrefs that are never hideable, whatever the stored value says. */
export const ALWAYS_VISIBLE_SECTIONS: readonly OnboardingSection[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/settings", label: "Settings" },
];

export const ALWAYS_VISIBLE = new Set(ALWAYS_VISIBLE_SECTIONS.map((section) => section.href));

/**
 * Keep only known, hideable hrefs. Drops unknown paths, empties, duplicates and
 * the always-visible ones, so a stale or hand-edited value cannot lock someone
 * out of Overview or Settings.
 */
export function normalizeHiddenTabs(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const href = raw.trim();
    if (!href || !HIDEABLE.has(href) || ALWAYS_VISIBLE.has(href)) continue;
    seen.add(href);
  }
  return [...seen];
}

/** Parse the stored comma-separated value. */
export function parseHiddenTabs(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return normalizeHiddenTabs(stored.split(","));
}

/** Serialize a selection for storage. */
export function serializeHiddenTabs(values: readonly string[]): string {
  return normalizeHiddenTabs(values).join(",");
}

/**
 * Whether a nav href is hidden from `role`. Only the onboarding role is
 * narrowed; every other role sees the full nav.
 */
export function isHiddenForRole(role: Role, href: string, hiddenTabs: readonly string[]): boolean {
  if (role !== "onboarding") return false;
  if (ALWAYS_VISIBLE.has(href)) return false;
  return hiddenTabs.includes(href);
}
