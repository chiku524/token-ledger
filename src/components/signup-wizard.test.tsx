import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/sign-up/actions", () => ({
  signUpAction: async () => undefined,
}));

import { SignupWizard, stepsFor } from "./signup-wizard";

describe("SignupWizard", () => {
  it("asks for an account and offers every connection", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" />);
    expect(html).toContain("Signup");
    expect(html).toContain("1 of 5");
    expect(html).toContain("Wallet");
    expect(html).toContain("Exchange");
    expect(html).toContain("Custodian");
    expect(html).toContain("scopes are balances and movements");
  });

  it("starts by asking whether the account is for an individual or an organization", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" />);
    expect(html).toContain("Individual");
    expect(html).toContain("Organization");
    expect(html).toMatch(/<input[^>]*name="accountType"[^>]*checked=""[^>]*value="organization"/);
    expect(html).toMatch(/<input[^>]*name="accountType"[^>]*value="individual"/);
  });

  it("walks an organization through Type, Account, Company, Connections and Review", () => {
    expect(stepsFor("organization")).toEqual(["Type", "Account", "Company", "Connections", "Review"]);
  });

  it("walks an individual through Type, Account, Details and Review, with no Connections step", () => {
    expect(stepsFor("individual")).toEqual(["Type", "Account", "Details", "Review"]);
  });

  it("counts four steps and offers no wallet, exchange or custodian fields to an individual", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" defaultAccountType="individual" />);
    expect(html).toContain("1 of 4");
    expect(html).not.toContain("1 of 5");
    expect(html).not.toContain("walletEnabled");
    expect(html).not.toContain("exchangeEnabled");
    expect(html).not.toContain("custodianEnabled");
    expect(html).not.toContain("scopes are balances and movements");
    expect(html).toContain("right after you sign up");
    expect(html).not.toContain('name="organizationName"');
  });

  it("still offers every connection to an organization", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" defaultAccountType="organization" />);
    expect(html).toContain("walletEnabled");
    expect(html).toContain("exchangeEnabled");
    expect(html).toContain("custodianEnabled");
  });

  it("keeps the Company step, with its required fields, for an organization", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" />);
    expect(html).toContain("Company");
    expect(html).toContain('name="organizationName"');
    expect(html).toContain('name="entityName"');
    expect(html).toContain('name="reportingFramework"');
  });
});
