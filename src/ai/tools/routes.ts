import type { Permission } from "@/auth/roles";

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
}

export const NAV_ROUTES: readonly NavRoute[] = [
  { slug: "overview", href: "/dashboard", label: "Overview" },
  { slug: "companies", href: "/dashboard/entities", label: "Companies" },
  { slug: "holdings", href: "/dashboard/sources", label: "Holdings" },
  { slug: "sources", href: "/dashboard/sources", label: "Holdings" },
  { slug: "journal", href: "/dashboard/ledger", label: "Journal" },
  { slug: "ledger", href: "/dashboard/ledger", label: "Journal" },
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

export function navRouteBySlug(slug: string): NavRoute | undefined {
  return NAV_ROUTES.find((route) => route.slug === slug);
}
