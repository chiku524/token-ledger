import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import { individualBooks } from "@/test/individual-books";
import { bannedTermsIn } from "@/test/banned-terms";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { ALL_TOOLS, INDIVIDUAL_TOOLS, toolByName, toolDefinitionsFor, toolsFor } from "./registry";
import type { ToolContext } from "./types";

function session(accountType: SessionUser["accountType"] | undefined, role: SessionUser["role"] = "owner"): Pick<{ session: SessionUser }, "session"> {
  return {
    session: {
      id: "u1",
      organizationId: "org_1",
      email: "u@example.test",
      name: "Test",
      role,
      // A session saved before account types existed has none, which means an organization.
      accountType: accountType as SessionUser["accountType"],
      platformAdmin: false,
      entityScope: [],
      demo: false,
      connectionTourCompletedAt: null,
      emailVerified: true,
    },
  };
}

describe("toolsFor", () => {
  it("leaves an organization's tools exactly as registered", () => {
    const names = toolsFor(session("organization")).map((tool) => tool.name);
    expect(names).toEqual(ALL_TOOLS.map((tool) => tool.name).filter((name) => names.includes(name)));
    expect(names).toContain("navigate");
    expect(toolsFor(session(undefined)).map((tool) => tool.name)).toEqual(names);
  });

  it("offers an individual only the allow-listed tools", () => {
    const names = toolsFor(session("individual")).map((tool) => tool.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(INDIVIDUAL_TOOLS).toContain(name);
    expect(names).toContain("navigate");
  });

  it("does not let an individual reach a tool outside the allow-list, even by name", () => {
    const offered = new Set(toolsFor(session("individual")).map((tool) => tool.name));
    const outside = ALL_TOOLS.filter((tool) => !INDIVIDUAL_TOOLS.includes(tool.name));
    expect(outside.length).toBeGreaterThan(0);
    for (const tool of outside) expect(offered.has(tool.name)).toBe(false);
  });

  it("still applies the role permission on top of the allow-list", () => {
    const viewer = toolsFor(session("individual", "viewer")).map((tool) => tool.name);
    expect(viewer).not.toContain("post_journal");
  });

  it("words the tool definitions for an individual without naming a hidden page", () => {
    const definitions = toolDefinitionsFor(session("individual"));
    const text = JSON.stringify(definitions);
    expect(hiddenSectionsIn(text)).toEqual([]);
    expect(text).toContain("list_activity");
    expect(text).not.toMatch(/journal|post_|reverse_/i);
    expect(definitions.find((tool) => tool.name === "navigate")?.description).not.toMatch(/journal/i);
  });

  it("offers an individual no tool that posts, reverses or lists entries", () => {
    const names = toolsFor(session("individual")).map((tool) => tool.name);
    expect(names).toContain("list_activity");
    for (const name of ["post_journal", "reverse_journal", "list_journal", "post_revaluation"]) expect(names).not.toContain(name);
    for (const name of INDIVIDUAL_TOOLS) expect(toolByName(name)?.kind).not.toBe("write");
    expect(toolsFor(session("individual")).every((tool) => !tool.requiresConfirm)).toBe(true);
  });

  it("keeps list_activity to individuals, so an organization's tools do not change", () => {
    expect(toolsFor(session("organization")).map((tool) => tool.name)).not.toContain("list_activity");
    expect(toolsFor(session(undefined)).map((tool) => tool.name)).not.toContain("list_activity");
  });

  it("reads activity newest first for an individual, limited and with no entry wording", async () => {
    const tool = toolsFor(session("individual")).find((item) => item.name === "list_activity")!;
    const ctx = { ...session("individual"), books: individualBooks, hiddenTabs: [], csrf: null } as unknown as ToolContext;
    const result = await tool.execute({ limit: 5 }, ctx);
    const rows = result.data as Array<{ date: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows.map((row) => row.date)).toEqual([...rows.map((row) => row.date)].sort().reverse());
    expect(result.route).toBe("/me/activity");
    expect(bannedTermsIn(JSON.stringify(result.data))).toEqual([]);
    const capped = await tool.execute({ limit: 9999, from: "not-a-date" }, ctx);
    expect((capped.data as unknown[]).length).toBeLessThanOrEqual(100);
  });

  it("keeps naming the Journal and Matching for an organization", () => {
    const text = JSON.stringify(toolDefinitionsFor(session("organization")));
    expect(text).toMatch(/matching/i);
    expect(text).toMatch(/journal/i);
  });
});

describe("the page an assistant tool points to", () => {
  const contextFor = (accountType: SessionUser["accountType"]) =>
    ({ ...session(accountType), books: individualBooks, hiddenTabs: [], csrf: null }) as unknown as ToolContext;
  const run = (accountType: SessionUser["accountType"], name: string, input: Record<string, unknown>) =>
    toolsFor(session(accountType)).find((tool) => tool.name === name)!.execute(input, contextFor(accountType));

  it("is the individual's own address for every read tool they have, so following it costs no redirect", async () => {
    expect((await run("individual", "list_holdings", {})).route).toBe("/me/holdings");
    expect((await run("individual", "list_connections", {})).route).toBe("/me/holdings");
    expect((await run("individual", "list_audit_events", {})).route).toBe("/me/history");
    expect((await run("individual", "list_activity", {})).route).toBe("/me/activity");
  });

  it("is the individual's own address when the navigate tool refuses, too", async () => {
    expect((await run("individual", "navigate", { slug: "matching" })).route).toBe("/me");
    expect((await run("individual", "navigate", { slug: "nonsense" })).route).toBe("/me");
    expect((await run("individual", "navigate", { slug: "settings" })).route).toBe("/me/settings");
  });

  it("stays on /dashboard for an organization", async () => {
    expect((await run("organization", "list_holdings", {})).route).toBe("/dashboard/sources");
    expect((await run("organization", "list_audit_events", {})).route).toBe("/dashboard/audit");
    expect((await run("organization", "navigate", { slug: "nonsense" })).route).toBe("/dashboard");
  });
});
