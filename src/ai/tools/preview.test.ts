import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth/current";
import type { Books } from "@/data/books";
import { postJournal, reverseJournal, closePeriodTool } from "./write";
import type { ToolContext } from "./types";

function session(role: SessionUser["role"] = "owner"): SessionUser {
  return {
    id: "u1",
    organizationId: "org_harbourline",
    email: "owner@harbourline.example",
    name: "Owner",
    role,
    entityScope: [],
    demo: false,
    connectionTourCompletedAt: null,
    emailVerified: true,
  };
}

const BOOKS = {
  notice: "",
  period: { start: "2026-01-01", end: "2026-03-31", label: "Q1" },
  organization: { id: "org_harbourline", name: "Harbourline", origin: "live" },
  entities: [
    { id: "ent_my", organizationId: "org_harbourline", name: "Harbourline MY", jurisdiction: "MY", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: null },
  ],
  assets: [],
  connections: [],
  sources: [],
  balanceSnapshots: [],
  accounts: [],
  journalEntries: [
    {
      id: "je_1",
      organizationId: "org_harbourline",
      entityId: "ent_my",
      reference: "JE-1042",
      entryDate: "2026-02-01",
      memo: "Original",
      currency: "MYR",
      debitMinor: 100n,
      creditMinor: 100n,
      lines: [],
      postedBy: "Owner",
      postedAt: "2026-02-01T00:00:00Z",
      reversesEntryId: null,
    },
  ],
  sourceTransactions: [],
  reconciliations: [],
  reconciliationOverrides: [],
  fxRates: [],
  assetPrices: [],
  auditEvents: [],
} as unknown as Books;

function ctx(): ToolContext {
  return { session: session(), books: BOOKS, hiddenTabs: [], csrf: "csrf" };
}

describe("write tool previews", () => {
  it("post_journal preview shows the fields, the lines, and balance", async () => {
    const preview = await postJournal.preview!(
      {
        entityId: "ent_my",
        reference: "JE-1",
        entryDate: "2026-02-10",
        memo: "Deposits",
        lines: [
          { accountCode: "1010", side: "debit", amount: "100.00" },
          { accountCode: "2010", side: "credit", amount: "100.00" },
        ],
      },
      ctx(),
    );
    expect(preview.action).toBe("Post journal");
    expect(preview.fields).toContainEqual({ label: "Company", value: "Harbourline MY" });
    expect(preview.lines).toHaveLength(2);
    expect(preview.balanced).toBe(true);
  });

  it("post_journal preview reports an unbalanced entry", async () => {
    const preview = await postJournal.preview!(
      {
        entityId: "ent_my",
        reference: "JE-2",
        entryDate: "2026-02-10",
        memo: "",
        lines: [
          { accountCode: "1010", side: "debit", amount: "100.00" },
          { accountCode: "2010", side: "credit", amount: "90.00" },
        ],
      },
      ctx(),
    );
    expect(preview.balanced).toBe(false);
  });

  it("reverse_journal preview names the original and the replacement", async () => {
    const preview = await reverseJournal.preview!(
      { reference: "JE-1042", newReference: "JE-1043", entryDate: "2026-02-11", memo: "typo" },
      ctx(),
    );
    expect(preview.action).toBe("Reverse journal");
    expect(preview.fields).toContainEqual({ label: "Original", value: "JE-1042" });
  });

  it("close_period preview states the range and the side effect", async () => {
    const preview = await closePeriodTool.preview!(
      { entityId: "ent_my", periodStart: "2026-02-01", periodEnd: "2026-02-28", note: "Month end" },
      ctx(),
    );
    expect(preview.action).toBe("Close period");
    expect(preview.fields).toContainEqual({ label: "From", value: "2026-02-01" });
    expect(preview.note).toMatch(/refused until it is reopened/i);
  });

  it("every write tool exposes a preview", async () => {
    const { writeTools } = await import("./write");
    for (const tool of writeTools) {
      expect(typeof tool.preview, `${tool.name} has no preview`).toBe("function");
    }
  });
});
