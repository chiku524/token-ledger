import { describe, expect, it } from "vitest";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { starterPromptsFor } from "./chat-starters";

describe("starterPromptsFor", () => {
  it("keeps the organization chips as they were", () => {
    const chips = starterPromptsFor("organization");
    expect(chips).toEqual([
      "Open matching",
      "Summarize the books this month",
      "Show unmatched movements this week",
      "Why is this connection still Waiting?",
    ]);
    expect(starterPromptsFor(undefined)).toEqual(chips);
  });

  it("offers an individual only pages and ideas it has", () => {
    const chips = starterPromptsFor("individual");
    expect(chips).toHaveLength(4);
    expect(hiddenSectionsIn(chips.join(" "))).toEqual([]);
    expect(chips.join(" ")).not.toMatch(/unmatched/i);
  });
});