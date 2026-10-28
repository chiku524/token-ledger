import { describe, expect, it } from "vitest";
import {
  HIDDEN_SECTION_PLACEHOLDER,
  filterMemoriesFor,
  mentionsHiddenSection,
  scrubHiddenSectionLinks,
  scrubStoredMessages,
} from "./hidden-sections";

const HIDDEN = [
  "/dashboard/reconciliation",
  "/dashboard/entities",
  "/dashboard/approvals",
  "/dashboard/consolidation",
  "/dashboard/billing",
  "/dashboard/treasury",
  "/dashboard/payables",
  "/dashboard/operations",
  "/dashboard/onboarding",
];

describe("scrubHiddenSectionLinks", () => {
  it.each(HIDDEN)("replaces a markdown link to %s for an individual", (href) => {
    const out = scrubHiddenSectionLinks(`Open [that page](${href}) now.`, "individual");
    expect(out).toBe(`Open ${HIDDEN_SECTION_PLACEHOLDER} now.`);
    expect(out).not.toContain(href);
  });

  it("drops the link text too, since the text may name the hidden section", () => {
    const out = scrubHiddenSectionLinks("See [Matching](/dashboard/reconciliation?from=2026-01-01 \"Matching\").", "individual");
    expect(out).not.toMatch(/matching|reconciliation/i);
  });

  it("replaces bare paths, deep paths with a query, and full URLs", () => {
    expect(scrubHiddenSectionLinks("Go to /dashboard/reconciliation.", "individual")).toBe(`Go to ${HIDDEN_SECTION_PLACEHOLDER}.`);
    expect(scrubHiddenSectionLinks("Go to /dashboard/entities/ent_1?tab=2 please", "individual")).toBe(`Go to ${HIDDEN_SECTION_PLACEHOLDER} please`);
    expect(scrubHiddenSectionLinks("https://ledger.test/dashboard/billing#plan", "individual")).toBe(HIDDEN_SECTION_PLACEHOLDER);
    expect(scrubHiddenSectionLinks("<https://ledger.test/dashboard/approvals>", "individual")).not.toContain("approvals");
  });

  it("handles several references in one message, hidden and allowed", () => {
    const out = scrubHiddenSectionLinks("[Holdings](/dashboard/sources), then /dashboard/operations and [Activity](/dashboard/ledger).", "individual");
    expect(out).toBe(`[Holdings](/dashboard/sources), then ${HIDDEN_SECTION_PLACEHOLDER} and [Activity](/dashboard/ledger).`);
  });

  it("leaves links to allowed sections, outside links and plain text alone", () => {
    const text = "Open [Holdings](/dashboard/sources?currency=USD), [docs](https://example.com/dashboard-tips) or /dashboard/reports.";
    expect(scrubHiddenSectionLinks(text, "individual")).toBe(text);
    expect(scrubHiddenSectionLinks("Nothing to see.", "individual")).toBe("Nothing to see.");
  });

  it("never touches an organization, or a missing account type", () => {
    const text = "Open [Matching](/dashboard/reconciliation) and /dashboard/entities.";
    expect(scrubHiddenSectionLinks(text, "organization")).toBe(text);
    expect(scrubHiddenSectionLinks(text, undefined)).toBe(text);
  });
});

describe("mentionsHiddenSection", () => {
  it.each(["Matching", "Reconciliation", "the Companies page", "Approvals", "Combined view", "billing", "Treasury", "Payables", "Operations"])(
    "flags an individual's text naming %s",
    (name) => {
      expect(mentionsHiddenSection(`Check ${name} for that.`, "individual")).toBe(true);
    },
  );

  it("flags a link or path even when no section is named", () => {
    expect(mentionsHiddenSection("Open /dashboard/entities", "individual")).toBe(true);
  });

  it("does not flag text about sections an individual has", () => {
    expect(mentionsHiddenSection("Your Holdings and Activity are on /dashboard/sources and /dashboard/ledger.", "individual")).toBe(false);
  });

  it("is always false for an organization", () => {
    expect(mentionsHiddenSection("Open Matching at /dashboard/reconciliation", "organization")).toBe(false);
    expect(mentionsHiddenSection("Open Matching", undefined)).toBe(false);
  });
});

describe("scrubStoredMessages", () => {
  const stored = [
    { id: "1", role: "user", content: "Where is /dashboard/reconciliation?" },
    { id: "2", role: "assistant", content: "Here: [Matching](/dashboard/reconciliation)." },
  ];

  it("scrubs the assistant's text and leaves the person's own words as typed", () => {
    const out = scrubStoredMessages(stored, "individual");
    expect(out[0]).toEqual(stored[0]);
    expect(out[1]).toEqual({ id: "2", role: "assistant", content: `Here: ${HIDDEN_SECTION_PLACEHOLDER}.` });
  });

  it("does not mutate its input and returns the same messages for an organization", () => {
    scrubStoredMessages(stored, "individual");
    expect(stored[1]!.content).toContain("/dashboard/reconciliation");
    expect(scrubStoredMessages(stored, "organization")).toEqual(stored);
  });
});

describe("filterMemoriesFor", () => {
  const memories = [
    { content: "You asked how to export Holdings as a PDF." },
    { content: "Open [Matching](/dashboard/reconciliation) to clear exceptions." },
    { content: "The Companies page lists every entity." },
  ];

  it("drops the memories that name or link a hidden section for an individual", () => {
    expect(filterMemoriesFor(memories, "individual")).toEqual([memories[0]]);
  });

  it("keeps every memory for an organization", () => {
    expect(filterMemoriesFor(memories, "organization")).toEqual(memories);
    expect(filterMemoriesFor(memories, undefined)).toEqual(memories);
  });
});
