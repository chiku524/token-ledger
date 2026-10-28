/**
 * Which dashboard sections each kind of account sees.
 *
 * An organization sees every section, exactly as before. An individual sees an
 * allow-list: new sections stay hidden from individuals until they are added
 * here on purpose. Pure and import-free so the client nav, the server page
 * guards and the later individual shell can all share one answer.
 */
import { DEFAULT_ORGANIZATION_ACCOUNT_TYPE, type OrganizationAccountType } from "./account-type";

/**
 * Sections an individual may open. Matching, Companies, Approvals, Combined,
 * Treasury, Payables, Billing, Operations and Onboarding are institution-only.
 * Users stays because an individual can invite a spouse or an accountant.
 * Platform stays because it is separately limited to platform admins.
 */
export const INDIVIDUAL_SECTIONS: readonly string[] = [
  "/dashboard",
  "/dashboard/sources",
  "/dashboard/ledger",
  "/dashboard/reports",
  "/dashboard/guide",
  "/dashboard/audit",
  "/dashboard/users",
  "/dashboard/settings",
  "/dashboard/setup",
  "/dashboard/platform",
];

/** Where someone is sent when they open a section their account type does not have. */
export const SECTION_REDIRECT = "/dashboard";

/** Whether an account of this type may open `href` (a path, a sub-path, or one with a query). */
export function isSectionAllowed(accountType: OrganizationAccountType | undefined, href: string): boolean {
  if ((accountType ?? DEFAULT_ORGANIZATION_ACCOUNT_TYPE) !== "individual") return true;
  const path = href.split(/[?#]/)[0] ?? "";
  return INDIVIDUAL_SECTIONS.some((section) => (section === "/dashboard" ? path === section : path === section || path.startsWith(section + "/")));
}
