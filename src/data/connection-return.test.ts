import { describe, expect, it } from "vitest";
import { connectionReturnPath } from "./connection-return";

describe("connectionReturnPath", () => {
  it("keeps the setup step and refuses an open redirect", () => {
    expect(connectionReturnPath("/dashboard/setup?step=exchange")).toBe("/dashboard/setup?step=exchange");
    expect(connectionReturnPath("https://example.com")).toBe("/dashboard/settings");
    expect(connectionReturnPath("/dashboard/setup?step=done&next=/")).toBe("/dashboard/settings");
  });

  it("keeps Operations for an organization but sends an individual to Settings instead", () => {
    expect(connectionReturnPath("/dashboard/operations")).toBe("/dashboard/operations");
    expect(connectionReturnPath("/dashboard/operations", "organization")).toBe("/dashboard/operations");
    expect(connectionReturnPath("/dashboard/operations", "individual")).toBe("/dashboard/settings");
  });

  it("keeps every other return path for an individual", () => {
    expect(connectionReturnPath("/dashboard/setup?step=exchange", "individual")).toBe("/dashboard/setup?step=exchange");
    expect(connectionReturnPath("/dashboard/sources?currency=SGD", "individual")).toBe("/dashboard/sources?currency=SGD");
    expect(connectionReturnPath("https://example.com", "individual")).toBe("/dashboard/settings");
  });

  it("keeps Holdings currency return paths so price refresh preserves the toggle", () => {
    expect(connectionReturnPath("/dashboard/sources?currency=USD")).toBe("/dashboard/sources?currency=USD");
    expect(connectionReturnPath("/dashboard/sources?currency=SGD")).toBe("/dashboard/sources?currency=SGD");
    expect(connectionReturnPath("/dashboard/sources?currency=MYR")).toBe("/dashboard/sources?currency=MYR");
    expect(connectionReturnPath("/dashboard/sources?currency=EUR")).toBe("/dashboard/settings");
  });
});
