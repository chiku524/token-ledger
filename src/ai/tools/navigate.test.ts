import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import type { Books } from "@/data/books";
import { navigate } from "./navigate";
import type { ToolContext } from "./types";

function ctx(role: SessionUser["role"], hiddenTabs: readonly string[] = []): ToolContext {
  return {
    session: {
      id: "u1",
      organizationId: "org_harbourline",
      email: "u@harbourline.example",
      name: "Test",
      role,
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
