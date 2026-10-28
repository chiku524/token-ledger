import { describe, expect, it } from "vitest";
import { bannedTermsIn, visibleText } from "./banned-terms";

describe("bannedTermsIn", () => {
  it("finds each accounting term, whatever its case", () => {
    expect(bannedTermsIn("Trial Balance, JOURNAL, a debit and a credit")).toEqual(["trial balance", "journal", "debit", "credit"]);
    expect(bannedTermsIn("Consolidated entity under IFRS and GAAP, accruals, chart of accounts, reconciliation, ledger")).toEqual([
      "consolidat",
      "entity",
      "ifrs",
      "gaap",
      "accrual",
      "chart of accounts",
      "reconciliation",
      "ledger",
    ]);
  });

  it("lets the product name through and finds nothing in plain words", () => {
    expect(bannedTermsIn("Token Ledger portfolio summary: Date, Asset, Amount, Value, Account/Source")).toEqual([]);
  });
});

describe("visibleText", () => {
  it("drops tags and link targets, so only what a person reads is checked", () => {
    expect(visibleText('<a href="/dashboard/ledger">Activity</a><script>ledger()</script>')).toBe(" Activity ");
  });
});
