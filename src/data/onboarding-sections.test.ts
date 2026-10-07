import { describe, expect, it } from "vitest";
import {
  ALWAYS_VISIBLE,
  ALWAYS_VISIBLE_SECTIONS,
  isHiddenForRole,
  normalizeHiddenTabs,
  ONBOARDING_SECTIONS,
  parseHiddenTabs,
  serializeHiddenTabs,
} from "./onboarding-sections";

describe("onboarding section catalog", () => {
  it("labels exactly the always-visible hrefs", () => {
    expect(new Set(ALWAYS_VISIBLE_SECTIONS.map((section) => section.href))).toEqual(ALWAYS_VISIBLE);
    expect(ALWAYS_VISIBLE_SECTIONS.map((section) => section.label)).toEqual(["Overview", "Settings"]);
  });

  it("never lists Overview or Settings as hideable", () => {
    const hrefs = ONBOARDING_SECTIONS.map((section) => section.href);
    for (const always of ALWAYS_VISIBLE) {
      expect(hrefs).not.toContain(always);
    }
  });

  it("has unique hrefs", () => {
    const hrefs = ONBOARDING_SECTIONS.map((section) => section.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("normalizeHiddenTabs", () => {
  it("keeps only known, hideable hrefs", () => {
    expect(normalizeHiddenTabs(["/dashboard/ledger", "/dashboard/audit"])).toEqual([
      "/dashboard/ledger",
      "/dashboard/audit",
    ]);
  });

  it("drops unknown, empty, always-visible and duplicate values", () => {
    expect(
      normalizeHiddenTabs([
        "/dashboard/ledger",
        "/dashboard/ledger",
        "/dashboard",
        "/dashboard/settings",
        "/no/such/page",
        "",
        "  ",
      ]),
    ).toEqual(["/dashboard/ledger"]);
  });
});

describe("parse/serialize round trip", () => {
  it("parses a stored value and ignores whitespace", () => {
    expect(parseHiddenTabs(" /dashboard/ledger , /dashboard/audit ")).toEqual(["/dashboard/ledger", "/dashboard/audit"]);
  });

  it("treats null and empty as nothing hidden", () => {
    expect(parseHiddenTabs(null)).toEqual([]);
    expect(parseHiddenTabs("")).toEqual([]);
  });

  it("serializes a normalized selection", () => {
    expect(serializeHiddenTabs(["/dashboard/ledger", "/dashboard", "/dashboard/ledger"])).toBe("/dashboard/ledger");
  });
});

describe("isHiddenForRole", () => {
  it("hides a listed tab only from the onboarding role", () => {
    const hidden = ["/dashboard/ledger"];
    expect(isHiddenForRole("onboarding", "/dashboard/ledger", hidden)).toBe(true);
    expect(isHiddenForRole("onboarding", "/dashboard/audit", hidden)).toBe(false);
    expect(isHiddenForRole("viewer", "/dashboard/ledger", hidden)).toBe(false);
    expect(isHiddenForRole("owner", "/dashboard/ledger", hidden)).toBe(false);
  });

  it("never hides Overview or Settings, even if somehow listed", () => {
    const hidden = ["/dashboard", "/dashboard/settings"];
    expect(isHiddenForRole("onboarding", "/dashboard", hidden)).toBe(false);
    expect(isHiddenForRole("onboarding", "/dashboard/settings", hidden)).toBe(false);
  });
});
