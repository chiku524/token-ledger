import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_ACCOUNT_TYPE,
  INDIVIDUAL_DEFAULTS,
  isOrganizationAccountType,
  ORGANIZATION_ACCOUNT_TYPES,
  personalBooksName,
} from "./account-type";

describe("account type", () => {
  it("offers organization and individual, and defaults to organization", () => {
    expect([...ORGANIZATION_ACCOUNT_TYPES]).toEqual(["organization", "individual"]);
    expect(DEFAULT_ORGANIZATION_ACCOUNT_TYPE).toBe("organization");
  });

  it("recognizes only the known types", () => {
    expect(isOrganizationAccountType("individual")).toBe(true);
    expect(isOrganizationAccountType("organization")).toBe(true);
    expect(isOrganizationAccountType("team")).toBe(false);
    expect(isOrganizationAccountType(null)).toBe(false);
  });

  it("names an individual's books after the person", () => {
    expect(personalBooksName("  Amina Rahman ")).toBe("Amina Rahman (Personal)");
    expect(personalBooksName("")).toBe("My (Personal)");
  });

  it("defaults to a two-letter country and a supported currency", () => {
    expect(INDIVIDUAL_DEFAULTS.jurisdiction).toMatch(/^[A-Z]{2}$/);
    expect(["MYR", "SGD", "USD"]).toContain(INDIVIDUAL_DEFAULTS.functionalCurrency);
  });
});
