import { describe, expect, it } from "vitest";
import { LedgerError, toMinor } from "@/ledger";
import { exampleBooks } from "./example-books";
import { assertCanReverse, postFormJournal } from "./journal-form";

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
    expect(() => assertCanReverse([...exampleBooks.journalEntries, reversed], original.id)).toThrow(/already has reversal/);
  });
});