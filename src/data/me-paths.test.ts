import { describe, expect, it } from "vitest";
import { dashboardPath, isDashboardPath, isMePath, mePath, pathFor } from "./me-paths";

describe("the individual's addresses", () => {
  it.each([
    ["/dashboard", "/me"],
    ["/dashboard/sources", "/me/holdings"],
    ["/dashboard/sources#observed-balances", "/me/holdings#observed-balances"],
    ["/dashboard/sources?currency=SGD", "/me/holdings?currency=SGD"],
    ["/dashboard/ledger", "/me/activity"],
    ["/dashboard/audit", "/me/history"],
    ["/dashboard/audit/export?action=x", "/me/history/export?action=x"],
    ["/dashboard/users", "/me/people"],
    ["/dashboard/reports/export?kind=pdf", "/me/reports/export?kind=pdf"],
    ["/dashboard/settings#connections", "/me/settings#connections"],
    ["/dashboard/setup?step=wallet", "/me/setup?step=wallet"],
  ])("%s is %s for a person, and back", (dashboard, me) => {
    expect(mePath(dashboard)).toBe(me);
    expect(dashboardPath(me)).toBe(dashboard);
  });

  it("leaves other addresses alone", () => {
    for (const href of ["/sign-in?next=/dashboard", "/", "https://example.com/dashboard", "/dashboardx", "/measure", "/memo"]) {
      expect(mePath(href)).toBe(href);
      expect(dashboardPath(href)).toBe(href);
    }
  });

  it("tells the two areas apart without matching a longer word", () => {
    expect(isMePath("/me")).toBe(true);
    expect(isMePath("/me/holdings?x=1")).toBe(true);
    expect(isMePath("/measure")).toBe(false);
    expect(isMePath("/dashboard")).toBe(false);
    expect(isDashboardPath("/dashboard/sources")).toBe(true);
    expect(isDashboardPath("/dashboardx")).toBe(false);
  });

  it("picks the address that belongs to the account type", () => {
    expect(pathFor("individual", "/dashboard/ledger")).toBe("/me/activity");
    expect(pathFor("individual", "/me/activity")).toBe("/me/activity");
    expect(pathFor("organization", "/me/activity")).toBe("/dashboard/ledger");
    expect(pathFor(undefined, "/me/holdings")).toBe("/dashboard/sources");
    expect(pathFor("organization", "/dashboard/ledger")).toBe("/dashboard/ledger");
  });
});
