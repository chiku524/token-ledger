import type { Permission } from "@/auth/roles";
import { isIndividualAccount, isSectionAllowed, sectionLabelFor } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";

/**
 * The dashboard routes the assistant can navigate to, mirroring the nav registry
 * in `src/components/nav-main.tsx`. Kept here as data so both the navigation
 * tool (server) and the chat panel (client) can validate a slug without
 * importing the icon-bearing nav component.
 */
export interface NavRoute {
  slug: string;
  href: string;
  label: string;
  /** A page that only some roles may open, beyond the onboarding hidden tabs. */
  permission?: Permission;
  /** A name only an individual account uses. An organization never sees this slug. */
  individualOnly?: boolean;
}

export const NAV_ROUTES: readonly NavRoute[] = [
  { slug: "overview", href: "/dashboard", label: "Overview" },
  { slug: "companies", href: "/dashboard/entities", label: "Companies" },
  { slug: "holdings", href: "/dashboard/sources", label: "Holdings" },
  { slug: "sources", href: "/dashboard/sources", label: "Holdings" },
  { slug: "journal", href: "/dashboard/ledger", label: "Journal" },
  { slug: "ledger", href: "/dashboard/ledger", label: "Journal" },
  { slug: "activity", href: "/dashboard/ledger", label: "Journal", individualOnly: true },
  { slug: "approvals", href: "/dashboard/approvals", label: "Approvals" },
  { slug: "matching", href: "/dashboard/reconciliation", label: "Matching" },
  { slug: "reconciliation", href: "/dashboard/reconciliation", label: "Matching" },
  { slug: "billing", href: "/dashboard/billing", label: "Billing" },
  { slug: "treasury", href: "/dashboard/treasury", label: "Treasury" },
  { slug: "payables", href: "/dashboard/payables", label: "Payables" },
  { slug: "reports", href: "/dashboard/reports", label: "Reports" },
  { slug: "combined", href: "/dashboard/consolidation", label: "Combined" },
  { slug: "consolidation", href: "/dashboard/consolidation", label: "Combined" },
  { slug: "operations", href: "/dashboard/operations", label: "Operations" },
  { slug: "history", href: "/dashboard/audit", label: "History" },
  { slug: "audit", href: "/dashboard/audit", label: "History" },
  { slug: "guide", href: "/dashboard/guide", label: "Guide" },
  { slug: "settings", href: "/dashboard/settings", label: "Settings" },
  { slug: "users", href: "/dashboard/users", label: "Users", permission: "users.manage" },
  { slug: "onboarding", href: "/dashboard/onboarding", label: "Onboarding", permission: "onboarding.manage" },
];

/**
 * The page names an individual no longer uses. They still open the page, so an
 * old habit or a remembered prompt works, but they are not offered to the model.
 */
const INDIVIDUAL_RENAMED_SLUGS: readonly string[] = ["journal", "ledger"];

/**
 * The routes this account type may be offered, with the label it sees. An
 * individual gets only the allow-listed sections (see `account-sections.ts`),
 * so the assistant cannot name or link a page the sidebar does not show.
 */
export function navRoutesFor(accountType?: OrganizationAccountType): NavRoute[] {
  const individual = isIndividualAccount(accountType);
  return NAV_ROUTES.filter((route) => {
    if (route.individualOnly && !individual) return false;
    if (individual && INDIVIDUAL_RENAMED_SLUGS.includes(route.slug)) return false;
    return isSectionAllowed(accountType, route.href);
  }).map((route) => ({ ...route, label: sectionLabelFor(accountType, route.href, route.label) }));
}

/**
 * Resolve a slug for an account type. Returns undefined for an unknown slug and
 * for a page the account type does not have, so the two cannot be told apart.
 */
export function navRouteBySlug(slug: string, accountType?: OrganizationAccountType): NavRoute | undefined {
  const route = NAV_ROUTES.find((item) => item.slug === slug);
  if (!route) return undefined;
  if (route.individualOnly && !isIndividualAccount(accountType)) return undefined;
  if (!isSectionAllowed(accountType, route.href)) return undefined;
  return { ...route, label: sectionLabelFor(accountType, route.href, route.label) };
}

/** Whether `slug` names a real page that this account type simply does not have. */
export function isHiddenNavSlug(slug: string, accountType?: OrganizationAccountType): boolean {
  const route = NAV_ROUTES.find((item) => item.slug === slug);
  return Boolean(route) && !navRouteBySlug(slug, accountType);
}