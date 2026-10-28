/**
 * What kind of customer owns a set of books.
 *
 * An `individual` is still an organization with one entity and one owner, so
 * holdings, connections and valuation work the same way. The type only decides
 * which experience the person is sent to, and which sign-up questions we ask.
 * Kept free of imports so the database schema, server code and client
 * components can all share it.
 */
export const ORGANIZATION_ACCOUNT_TYPES = ["organization", "individual"] as const;

export type OrganizationAccountType = (typeof ORGANIZATION_ACCOUNT_TYPES)[number];

/** Existing rows, demo sessions and any caller that does not say otherwise. */
export const DEFAULT_ORGANIZATION_ACCOUNT_TYPE: OrganizationAccountType = "organization";

export function isOrganizationAccountType(value: unknown): value is OrganizationAccountType {
  return typeof value === "string" && (ORGANIZATION_ACCOUNT_TYPES as readonly string[]).includes(value);
}

/** Defaults an individual gets in place of the Company step. */
export const INDIVIDUAL_DEFAULTS = {
  /** Two-letter country code, used when the person does not pick one. */
  jurisdiction: "US",
  functionalCurrency: "USD",
  /** An existing reporting standard; individuals never see this field. */
  reportingFramework: "IFRS",
} as const;

/** The name given to an individual's organization and entity, from their own name. */
export function personalBooksName(ownerName: string): string {
  const name = ownerName.trim();
  return `${name || "My"} (Personal)`;
}
