import { describe, expect, it } from "vitest";
import { isSectionAllowed } from "@/data/account-sections";
import { isHiddenNavSlug, NAV_ROUTES, navRouteBySlug, navRoutesFor } from "./routes";

describe("navRoutesFor", () => {
  it("gives an organization every route except the individual-only name", () => {
    const slugs = navRoutesFor("organization").map((route) => route.slug);
    expect(slugs).toEqual(NAV_ROUTES.filter((route) => !route.individualOnly).map((route) => route.slug));
    expect(slugs).toContain("matching");
    expect(slugs).toContain("journal");
    expect(slugs).not.toContain("activity");
    expect(navRoutesFor(undefined)).toEqual(navRoutesFor("organization"));
  });

  it("keeps the organization labels as they were", () => {
    expect(navRoutesFor("organization").find((route) => route.slug === "journal")?.label).toBe("Journal");
  });

  it("gives an individual only the sections it has, with Activity for Journal", () => {
    const routes = navRoutesFor("individual");
    for (const route of routes) expect(isSectionAllowed("individual", route.href)).toBe(true);
    const slugs = routes.map((route) => route.slug);
    for (const hidden of ["matching", "reconciliation", "companies", "approvals", "combined", "consolidation", "billing", "treasury", "payables", "operations", "onboarding"]) {
      expect(slugs).not.toContain(hidden);
    }
    expect(slugs).toEqual(expect.arrayContaining(["overview", "holdings", "activity", "reports", "history", "guide", "settings", "users"]));
    expect(slugs).not.toContain("journal");
    expect(slugs).not.toContain("ledger");
    expect(routes.find((route) => route.slug === "activity")).toMatchObject({ href: "/dashboard/ledger", label: "Activity" });
    expect(routes.map((route) => route.label)).not.toContain("Journal");
  });
});

describe("navRouteBySlug", () => {
  it("resolves a hidden page for an organization but not an individual", () => {
    expect(navRouteBySlug("matching", "organization")?.href).toBe("/dashboard/reconciliation");
    expect(navRouteBySlug("matching", "individual")).toBeUndefined();
    expect(navRouteBySlug("operations", "individual")).toBeUndefined();
    expect(navRouteBySlug("matching")?.href).toBe("/dashboard/reconciliation");
  });

  it("resolves the old Journal names for an individual to the Activity page", () => {
    expect(navRouteBySlug("journal", "individual")).toMatchObject({ href: "/dashboard/ledger", label: "Activity" });
    expect(navRouteBySlug("ledger", "individual")).toMatchObject({ href: "/dashboard/ledger", label: "Activity" });
  });

  it("only offers the activity name to an individual", () => {
    expect(navRouteBySlug("activity", "individual")?.href).toBe("/dashboard/ledger");
    expect(navRouteBySlug("activity", "organization")).toBeUndefined();
    expect(navRouteBySlug("activity")).toBeUndefined();
  });
});

describe("isHiddenNavSlug", () => {
  it("is true only for a real page the account does not have", () => {
    expect(isHiddenNavSlug("matching", "individual")).toBe(true);
    expect(isHiddenNavSlug("matching", "organization")).toBe(false);
    expect(isHiddenNavSlug("nope", "individual")).toBe(false);
    expect(isHiddenNavSlug("holdings", "individual")).toBe(false);
  });
});