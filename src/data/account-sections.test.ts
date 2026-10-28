import { describe, expect, it } from "vitest";
import { INDIVIDUAL_EXPORT_KINDS, INDIVIDUAL_SECTIONS, INDIVIDUAL_TOOL_LABELS, isExportKindAllowed, isIndividualAccount, isSectionAllowed, journalName, journalNameLower, sectionLabelFor } from "./account-sections";

const INSTITUTION_ONLY = [
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

describe("isSectionAllowed", () => {
  it("lets an organization into every section", () => {
    for (const href of [...INDIVIDUAL_SECTIONS, ...INSTITUTION_ONLY, "/dashboard/anything-new"]) {
      expect(isSectionAllowed("organization", href)).toBe(true);
    }
  });

  it("treats a missing account type as an organization", () => {
    expect(isSectionAllowed(undefined, "/dashboard/reconciliation")).toBe(true);
  });

  it.each(INSTITUTION_ONLY)("keeps an individual out of %s", (href) => {
    expect(isSectionAllowed("individual", href)).toBe(false);
    expect(isSectionAllowed("individual", href + "/deeper")).toBe(false);
    expect(isSectionAllowed("individual", href + "?from=2026-01-01")).toBe(false);
  });

  it.each(["/dashboard", "/dashboard/sources", "/dashboard/ledger", "/dashboard/reports", "/dashboard/guide", "/dashboard/audit", "/dashboard/users", "/dashboard/settings", "/dashboard/setup"])(
    "lets an individual into %s",
    (href) => {
      expect(isSectionAllowed("individual", href)).toBe(true);
    },
  );

  it("handles queries, anchors and sub-paths of an allowed section", () => {
    expect(isSectionAllowed("individual", "/dashboard/sources#observed-balances")).toBe(true);
    expect(isSectionAllowed("individual", "/dashboard/setup?step=wallet")).toBe(true);
    expect(isSectionAllowed("individual", "/dashboard/sources/extra")).toBe(true);
  });

  it("does not match on a shared prefix, and hides unknown sections", () => {
    expect(isSectionAllowed("individual", "/dashboard/sourcesx")).toBe(false);
    expect(isSectionAllowed("individual", "/dashboard/anything-new")).toBe(false);
    expect(isSectionAllowed("individual", "/other")).toBe(false);
  });
});

describe("the Activity name", () => {
  it("calls an individual's Journal page Activity", () => {
    expect(journalName("individual")).toBe("Activity");
    expect(journalNameLower("individual")).toBe("activity");
    expect(sectionLabelFor("individual", "/dashboard/ledger", "Journal")).toBe("Activity");
    expect(sectionLabelFor("individual", "/dashboard/ledger?from=2026-01-01", "Journal")).toBe("Activity");
  });

  it("leaves an organization's Journal alone, whether the type is given or not", () => {
    for (const accountType of ["organization", undefined] as const) {
      expect(journalName(accountType)).toBe("Journal");
      expect(journalNameLower(accountType)).toBe("journal");
      expect(sectionLabelFor(accountType, "/dashboard/ledger", "Journal")).toBe("Journal");
    }
  });

  it("does not relabel any other section", () => {
    expect(sectionLabelFor("individual", "/dashboard/reports", "Reports")).toBe("Reports");
    expect(sectionLabelFor("individual", "/dashboard/sources", "Holdings")).toBe("Holdings");
  });

  it("knows which account types are individuals", () => {
    expect(isIndividualAccount("individual")).toBe(true);
    expect(isIndividualAccount("organization")).toBe(false);
    expect(isIndividualAccount(undefined)).toBe(false);
  });
});

describe("isExportKindAllowed", () => {
  it("lets an organization download every kind, and an unspecified account too", () => {
    for (const kind of ["pdf", "trial-balance", "journal", "reconciliation", "anything-new", null]) {
      expect(isExportKindAllowed("organization", kind)).toBe(true);
      expect(isExportKindAllowed(undefined, kind)).toBe(true);
    }
  });

  it("lets an individual download only the kinds on its own pages", () => {
    for (const kind of INDIVIDUAL_EXPORT_KINDS) expect(isExportKindAllowed("individual", kind)).toBe(true);
    expect([...INDIVIDUAL_EXPORT_KINDS].sort()).toEqual(["journal", "pdf", "trial-balance"]);
  });

  it("keeps an individual out of reconciliation, unknown kinds and a missing kind", () => {
    expect(isExportKindAllowed("individual", "reconciliation")).toBe(false);
    expect(isExportKindAllowed("individual", "anything-new")).toBe(false);
    expect(isExportKindAllowed("individual", null)).toBe(false);
  });
});

describe("INDIVIDUAL_TOOL_LABELS", () => {
  it("renames only the tools that name the Journal page", () => {
    expect(Object.keys(INDIVIDUAL_TOOL_LABELS).sort()).toEqual(["list_journal", "post_journal", "reverse_journal"]);
    for (const label of Object.values(INDIVIDUAL_TOOL_LABELS)) {
      expect(label).not.toMatch(/journal/i);
      expect(label).toMatch(/activity/i);
    }
  });
});
