import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/sign-up/actions", () => ({
  signUpAction: async () => undefined,
}));

import { SignupWizard } from "./signup-wizard";

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

  it("keeps the Company step, with its required fields, for an organization", () => {
    const html = renderToStaticMarkup(<SignupWizard csrf="csrf" />);
    expect(html).toContain("Company");
    expect(html).toContain('name="organizationName"');
    expect(html).toContain('name="entityName"');
    expect(html).toContain('name="reportingFramework"');
  });
});
