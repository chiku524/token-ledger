import { describe, expect, it } from "vitest";
import { bannedTermsIn } from "@/test/banned-terms";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import {
  CAPABILITY_GROUPS,
  EXAMPLE_PROMPTS,
  FIRST_RUN_STEPS,
  GUIDE_SECTIONS,
  REFUSALS,
  capabilityGroupsFor,
  examplePromptsFor,
  firstRunStepsFor,
  guideDescriptionFor,
  guideSectionsFor,
  refusalsFor,
  tourPathFor,
} from "./ai-chatbot-guide";

describe("guide content for an organization", () => {
  it("is exactly the original content, whether the type is given or not", () => {
    for (const accountType of ["organization", undefined] as const) {
      expect(guideSectionsFor(accountType)).toEqual(GUIDE_SECTIONS);
      expect(firstRunStepsFor(accountType)).toEqual(FIRST_RUN_STEPS);
      expect(capabilityGroupsFor(accountType)).toEqual(CAPABILITY_GROUPS);
      expect(examplePromptsFor(accountType)).toEqual(EXAMPLE_PROMPTS);
      expect(refusalsFor(accountType)).toEqual(REFUSALS);
    }
  });

  it("still talks about Matching, Approvals and the Journal", () => {
    const text = JSON.stringify([GUIDE_SECTIONS, CAPABILITY_GROUPS, REFUSALS, EXAMPLE_PROMPTS]);
    expect(text).toMatch(/matching/i);
    expect(text).toMatch(/approval/i);
    expect(text).toMatch(/journal/i);
    expect(tourPathFor("organization")).toMatch(/Match/);
  });
});

describe("guide content for an individual", () => {
  const individual = "individual" as const;

  it("mentions and links to no hidden section", () => {
    const everything = JSON.stringify([
      guideSectionsFor(individual),
      firstRunStepsFor(individual),
      capabilityGroupsFor(individual),
      examplePromptsFor(individual),
      refusalsFor(individual),
      guideDescriptionFor(individual),
      tourPathFor(individual),
    ]);
    expect(hiddenSectionsIn(everything)).toEqual([]);
    expect(everything).not.toMatch(/period close|quorum|Journal/);
  });

  it("walks Connect, Check, Holdings, Reports", () => {
    expect(firstRunStepsFor(individual)).toHaveLength(5);
    expect(JSON.stringify(firstRunStepsFor(individual))).toContain("Reports");
    expect(capabilityGroupsFor(individual).map((group) => group.title)).toContain("Activity");
    expect(capabilityGroupsFor(individual).map((group) => group.title)).toContain("Reports");
    expect(tourPathFor(individual)).toBe("Connect \u2192 Check \u2192 Holdings \u2192 Reports");
  });

  it("uses plain report names and no accounting terms or entry wording", () => {
    const everything = JSON.stringify([
      guideSectionsFor(individual),
      firstRunStepsFor(individual),
      capabilityGroupsFor(individual),
      examplePromptsFor(individual),
      refusalsFor(individual),
      guideDescriptionFor(individual),
      tourPathFor(individual),
    ]);
    expect(bannedTermsIn(everything)).toEqual([]);
    expect(everything).not.toMatch(/posted|post a|unposted/i);
    for (const name of ["Portfolio summary", "Activity history", "Value over time"]) expect(everything).toContain(name);
  });

  it("keeps the same sections to read", () => {
    expect(guideSectionsFor(individual).map((section) => section.id)).toEqual(GUIDE_SECTIONS.map((section) => section.id));
  });

  it("drops the refusals about approvals and period close", () => {
    const titles = refusalsFor(individual).map((refusal) => refusal.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.length).toBeLessThan(REFUSALS.length);
    expect(titles).not.toContain("Bypass Approvals or period close");
  });
});