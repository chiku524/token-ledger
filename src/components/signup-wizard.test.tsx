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
    expect(html).toContain("1 of 4");
    expect(html).toContain("Wallet");
    expect(html).toContain("Exchange");
    expect(html).toContain("Custodian");
    expect(html).toContain("does not ask for an API key");
  });
});
