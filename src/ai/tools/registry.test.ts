import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { ALL_TOOLS, INDIVIDUAL_TOOLS, toolDefinitionsFor, toolsFor } from "./registry";

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
    expect(text).toContain("Activity");
    expect(definitions.find((tool) => tool.name === "navigate")?.description).not.toMatch(/journal/i);
  });

  it("keeps naming the Journal and Matching for an organization", () => {
    const text = JSON.stringify(toolDefinitionsFor(session("organization")));
    expect(text).toMatch(/matching/i);
    expect(text).toMatch(/journal/i);
  });
});