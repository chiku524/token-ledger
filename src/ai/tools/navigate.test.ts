import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import type { Books } from "@/data/books";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { navigate, navigateSpec } from "./navigate";
import type { ToolContext } from "./types";

function ctx(role: SessionUser["role"], hiddenTabs: readonly string[] = [], accountType: SessionUser["accountType"] = "organization"): ToolContext {
  return {
    session: {
      id: "u1",
      organizationId: "org_harbourline",
      email: "u@harbourline.example",
      name: "Test",
      role,
      accountType,
      platformAdmin: false,
      entityScope: [],
      demo: false,
      connectionTourCompletedAt: null,
      emailVerified: true,
    },
    books: { entities: [] } as unknown as Books,
    hiddenTabs,
    csrf: null,
  };
}

describe("navigate tool (AI-08)", () => {
  it("returns the route for a known page", async () => {
    const result = await navigate.execute({ slug: "matching" }, ctx("viewer"));
    expect(result.route).toBe("/dashboard/reconciliation");
    expect(result.summary).toBe("Opening Matching.");
  });

  it("resolves aliases to the same page", async () => {
    expect((await navigate.execute({ slug: "reconciliation" }, ctx("viewer"))).route).toBe("/dashboard/reconciliation");
    expect((await navigate.execute({ slug: "ledger" }, ctx("viewer"))).route).toBe("/dashboard/ledger");
  });

  it("refuses a hidden section for the onboarding role", async () => {
    const result = await navigate.execute({ slug: "matching" }, ctx("onboarding", ["/dashboard/reconciliation"]));
    expect(result.route).toBe("/dashboard");
    expect(result.summary).toMatch(/hidden/i);
  });

  it("refuses a page the role cannot hold", async () => {
    const result = await navigate.execute({ slug: "users" }, ctx("viewer"));
    expect(result.route).toBe("/dashboard");
    expect(result.summary).toMatch(/cannot open/i);
  });

  it("refuses an unknown page", async () => {
    const result = await navigate.execute({ slug: "nope" }, ctx("owner"));
    expect(result.summary).toMatch(/don't know a page/i);
    expect(result.route).toBe("/dashboard");
  });

  it("does not leak a route for a refused destination", async () => {
    const result = await navigate.execute({ slug: "users" }, ctx("accountant"));
    expect(result.data).toBeUndefined();
  });
});

describe("navigate tool for an individual", () => {
  const individual = (role: SessionUser["role"] = "owner") => ctx(role, [], "individual");

  it("opens a page the account has, under its Activity name", async () => {
    const holdings = await navigate.execute({ slug: "holdings" }, individual());
    expect(holdings.route).toBe("/me/holdings");
    const activity = await navigate.execute({ slug: "activity" }, individual());
    expect(activity.route).toBe("/me/activity");
    expect(activity.summary).toBe("Opening Activity.");
  });

  it("still opens the Activity page from the old Journal names", async () => {
    expect((await navigate.execute({ slug: "journal" }, individual())).route).toBe("/me/activity");
    expect((await navigate.execute({ slug: "ledger" }, individual())).summary).toBe("Opening Activity.");
  });

  it.each(["matching", "reconciliation", "companies", "approvals", "combined", "billing", "treasury", "payables", "operations", "onboarding"])(
    "does not open or name %s",
    async (slug) => {
      const result = await navigate.execute({ slug }, individual());
      expect(result.route).toBe("/dashboard");
      expect(result.data).toBeUndefined();
      expect(hiddenSectionsIn(result.summary)).toEqual([]);
      expect(result.summary).not.toContain(slug);
      expect(result.summary).toMatch(/isn't part of this account/i);
    },
  );

  it("lists only pages the account has when it cannot open the request", async () => {
    const { summary } = await navigate.execute({ slug: "matching" }, individual());
    expect(summary).toContain("Holdings");
    expect(summary).toContain("Activity");
    expect(summary).not.toContain("Journal");
  });

  it("describes only the account's pages in the tool definition", () => {
    const spec = navigateSpec("individual");
    const text = JSON.stringify(spec);
    expect(hiddenSectionsIn(text)).toEqual([]);
    expect(text).toContain("activity");
    expect(text).not.toMatch(/journal/i);
  });

  it("keeps the organization definition naming every page", () => {
    const text = JSON.stringify(navigateSpec("organization"));
    expect(text).toContain("matching");
    expect(text).toContain("journal");
  });
});
