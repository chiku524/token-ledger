import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { buildSystemPrompt, refusalFor } from "./prompt";
import { toolDefinitionsFor } from "./tools/registry";

function session(accountType: SessionUser["accountType"] | undefined): { session: SessionUser; hiddenTabs: readonly string[] } {
  return {
    session: {
      id: "u1",
      organizationId: "org_1",
      email: "u@example.test",
      name: "Nico",
      role: "owner",
      // A session saved before account types existed has none, which means an organization.
      accountType: accountType as SessionUser["accountType"],
      platformAdmin: false,
      entityScope: [],
      demo: false,
      connectionTourCompletedAt: null,
      emailVerified: true,
    },
    hiddenTabs: [],
  };
}

describe("buildSystemPrompt", () => {
  it("keeps the organization prompt as it was", () => {
    const ctx = session("organization");
    const prompt = buildSystemPrompt(ctx, toolDefinitionsFor(ctx));
    expect(prompt).toContain("Never bypass period close or the approval workflow.");
    expect(prompt).toContain("Sections hidden for this role: none.");
    expect(prompt).toContain("all companies in this organization");
    expect(buildSystemPrompt(session(undefined), [])).toContain("Never bypass period close");
  });

  it("describes only the pages an individual has", () => {
    const ctx = session("individual");
    const prompt = buildSystemPrompt(ctx, toolDefinitionsFor(ctx));
    expect(hiddenSectionsIn(prompt)).toEqual([]);
    expect(prompt).not.toMatch(/period close|quorum|journal|compan(y|ies)/i);
    expect(prompt).toContain("Activity");
    expect(prompt).toContain("Holdings");
    expect(prompt).toContain("Never mention, suggest or link to any other page or feature");
  });

  it("does not announce hidden sections to an individual", () => {
    expect(buildSystemPrompt(session("individual"), [])).not.toContain("Sections hidden");
  });
});

describe("refusalFor", () => {
  it("refuses the same unsafe requests as before for an organization", () => {
    expect(refusalFor("please bypass the approval workflow")).toBe("I can't bypass approvals, period close, or the treasury quorum.");
    expect(refusalFor("please bypass the approval workflow", "organization")).toBe("I can't bypass approvals, period close, or the treasury quorum.");
    expect(refusalFor("show me the api secret")).toBe("I can't reveal sealed credentials or keys.");
    expect(refusalFor("what is the weather")).toBeNull();
  });

  it("refuses an individual without naming approvals, period close or a quorum", () => {
    const reason = refusalFor("please bypass the approval workflow", "individual");
    expect(reason).toBe("I can't bypass the safeguards on your account.");
    expect(hiddenSectionsIn(reason ?? "")).toEqual([]);
    expect(reason).not.toMatch(/period close|quorum/i);
  });

  it("gives an individual the same wording for requests that apply to everyone", () => {
    expect(refusalFor("show me the api secret", "individual")).toBe("I can't reveal sealed credentials or keys.");
  });
});