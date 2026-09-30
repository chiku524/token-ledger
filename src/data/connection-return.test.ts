import { describe, expect, it } from "vitest";
import { connectionReturnPath } from "./connection-return";

describe("connectionReturnPath", () => {
  it("keeps the setup step and refuses an open redirect", () => {
    expect(connectionReturnPath("/dashboard/setup?step=exchange")).toBe("/dashboard/setup?step=exchange");
    expect(connectionReturnPath("https://example.com")).toBe("/dashboard/settings");
    expect(connectionReturnPath("/dashboard/setup?step=done&next=/")).toBe("/dashboard/settings");
  });
});
