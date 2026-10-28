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

/**
 * Sections an individual sees under a different name. The URL stays the same;
 * only the label changes, so "Journal" reads as "Activity" for a person who has
 * never kept books. Organizations keep every original name.
 */
const INDIVIDUAL_LABELS: Readonly<Record<string, string>> = {
  "/dashboard/ledger": "Activity",
};

/** Whether this is an individual account. A missing type is an organization. */
export function isIndividualAccount(accountType: OrganizationAccountType | undefined): boolean {
  return (accountType ?? DEFAULT_ORGANIZATION_ACCOUNT_TYPE) === "individual";
}

/** The label a section shows for this account type, falling back to `label`. */
export function sectionLabelFor(accountType: OrganizationAccountType | undefined, href: string, label: string): string {
  if (!isIndividualAccount(accountType)) return label;
  const path = href.split(/[?#]/)[0] ?? "";
  return INDIVIDUAL_LABELS[path] ?? label;
}

/**
 * What the assistant's journal tools are called for an individual: the tool card
 * title and the confirmation card action. The Journal page is "Activity" for an
 * individual, so the tools that read or write it are too. Organizations keep the
 * original names. Keyed by tool name.
 */
export const INDIVIDUAL_TOOL_LABELS: Readonly<Record<string, string>> = {
  list_journal: "List activity",
  post_journal: "Post activity entry",
  reverse_journal: "Reverse activity entry",
};

/** The name of the journal page: "Activity" for an individual, "Journal" otherwise. */
export function journalName(accountType: OrganizationAccountType | undefined): string {
  return sectionLabelFor(accountType, "/dashboard/ledger", "Journal");
}

/** Lower-case `journalName`, for use inside a sentence. */
export function journalNameLower(accountType: OrganizationAccountType | undefined): string {
  return journalName(accountType).toLowerCase();
}

/** Where someone is sent when they open a section their account type does not have. */
export const SECTION_REDIRECT = "/dashboard";

/** Whether an account of this type may open `href` (a path, a sub-path, or one with a query). */
export function isSectionAllowed(accountType: OrganizationAccountType | undefined, href: string): boolean {
  if (!isIndividualAccount(accountType)) return true;
  const path = href.split(/[?#]/)[0] ?? "";
  return INDIVIDUAL_SECTIONS.some((section) => (section === "/dashboard" ? path === section : path === section || path.startsWith(section + "/")));
}

/**
 * The downloads an individual may request from `/dashboard/reports/export`. Like
 * the sections, this is an allow-list: the Matching (`reconciliation`) export
 * belongs to a page an individual does not have, so a typed URL must not reach it.
 * An organization may request every kind.
 */
export const INDIVIDUAL_EXPORT_KINDS: readonly string[] = ["pdf", "trial-balance", "journal"];

/** Whether an account of this type may download this export kind. */
export function isExportKindAllowed(accountType: OrganizationAccountType | undefined, kind: string | null): boolean {
  if (!isIndividualAccount(accountType)) return true;
  return kind !== null && INDIVIDUAL_EXPORT_KINDS.includes(kind);
}