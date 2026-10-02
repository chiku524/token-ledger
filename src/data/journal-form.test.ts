import { describe, expect, it } from "vitest";
import { LedgerError, toMinor } from "@/ledger";
import { exampleBooks } from "./example-books";
import { assertCanReverse, draftFromForm, postFormJournal } from "./journal-form";
import { blocksSelfApproval } from "@/auth/roles";

describe("draftFromForm", () => {
  it("splits a balanced form into draft lines with no id", () => {
    const draft = draftFromForm(
      {
        entityId: "ent_harbourline_my",
        reference: "DRAFT-1",
        entryDate: "2026-06-30",
        memo: "A draft.",
        lines: [
          { accountCode: "1000", side: "debit", amount: "12.00" },
          { accountCode: "3100", side: "credit", amount: "12.00" },
        ],
      },
      exampleBooks,
    );
    expect(draft.currency).toBe("MYR");
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ accountCode: "1000", side: "debit" });
  });

  it("rejects an unbalanced draft", () => {
    expect(() =>
      draftFromForm(
        {
          entityId: "ent_harbourline_my",
          reference: "DRAFT-BAD",
          entryDate: "2026-06-30",
          memo: "Unbalanced.",
          lines: [
            { accountCode: "1000", side: "debit", amount: "10.00" },
            { accountCode: "3100", side: "credit", amount: "9.00" },
          ],
        },
        exampleBooks,
      ),
    ).toThrow(LedgerError);
  });
});

describe("blocksSelfApproval", () => {
  it("blocks the preparer approving their own entry, unless noted", () => {
    expect(blocksSelfApproval("A <a@x>", "A <a@x>", null)).toBe(true);
    expect(blocksSelfApproval("A <a@x>", "A <a@x>", "  ")).toBe(true);
    expect(blocksSelfApproval("A <a@x>", "A <a@x>", "Owner reviewed")).toBe(false);
    expect(blocksSelfApproval("A <a@x>", "B <b@x>", null)).toBe(false);
  });
});

describe("postFormJournal", () => {
  it("posts in the entity functional currency and rejects an unbalanced entry", () => {
    const posted = postFormJournal(
      {
        entityId: "ent_harbourline_my",
        reference: "JE-TEST",
        entryDate: "2026-06-30",
        memo: "Example form posting.",
        lines: [
          { accountCode: "1000", side: "debit", amount: "15.50" },
          { accountCode: "3100", side: "credit", amount: "15.50" },
        ],
      },
      exampleBooks,
    );
    expect(posted.currency).toBe("MYR");
    expect(posted.debitMinor).toBe(toMinor("15.50", 2));

    expect(() =>
      postFormJournal(
        {
          entityId: "ent_harbourline_my",
          reference: "JE-BAD",
          entryDate: "2026-06-30",
          memo: "Unbalanced.",
          lines: [
            { accountCode: "1000", side: "debit", amount: "10.00" },
            { accountCode: "3100", side: "credit", amount: "9.00" },
          ],
        },
        exampleBooks,
      ),
    ).toThrow(LedgerError);
  });

  it("refuses a second reversal of the same entry", () => {
    const original = exampleBooks.journalEntries[0];
    if (!original) throw new Error("missing entry");
    const reversed = { ...original, id: "je_new", reference: "JE-R", reversesEntryId: original.id, memo: "reversal" };
    expect(() => assertCanReverse([...exampleBooks.journalEntries, reversed], original.id)).toThrow(/already has correction/);
  });
});