import { describe, expect, it } from "vitest";
import { toMinor } from "./money";
import { postJournalEntry } from "./post";
import type { JournalEntryInput, JournalLineInput } from "./types";
import { LedgerError } from "./types";

const myr = (amount: string) => toMinor(amount, 2);

function line(overrides: Partial<JournalLineInput> & Pick<JournalLineInput, "side" | "amountMinor">): JournalLineInput {
  return {
    accountCode: "1000",
    currency: "MYR",
    ...overrides,
  };
}

function entry(overrides: Partial<JournalEntryInput> = {}, lines?: JournalLineInput[]): JournalEntryInput {
  return {
    id: "je_test",
    entityId: "ent_my",
    reference: "JE-TEST",
    entryDate: "2026-04-08",
    memo: "Example test entry",
    lines: lines ?? [
      line({ accountCode: "1310", side: "debit", amountMinor: myr("100.00") }),
      line({ accountCode: "1000", side: "credit", amountMinor: myr("100.00") }),
    ],
    ...overrides,
  };
}

describe("postJournalEntry", () => {
  it("posts a balanced entry and numbers the lines", () => {
    const posted = postJournalEntry(entry());
    expect(posted.id).toBe("je_test");
    expect(posted.currency).toBe("MYR");
    expect(posted.debitMinor).toBe(posted.creditMinor);
    expect(posted.lines.map((item) => item.lineNumber)).toEqual([1, 2]);
  });

  it("allows a wallet transfer that debits and credits the same account", () => {
    const posted = postJournalEntry(
      entry({}, [
        line({
          accountCode: "1310",
          side: "debit",
          amountMinor: myr("80.00"),
          quantityMinor: toMinor("2", 18),
          assetCode: "ETH",
          quantityDirection: "in",
          sourceId: "src_cold",
        }),
        line({
          accountCode: "1310",
          side: "credit",
          amountMinor: myr("80.00"),
          quantityMinor: toMinor("2", 18),
          assetCode: "ETH",
          quantityDirection: "out",
          sourceId: "src_exchange",
        }),
      ]),
    );
    expect(posted.debitMinor).toBe(myr("80.00"));
  });

  it("rejects unbalanced entries, including a one-unit difference", () => {
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: myr("100.00") }),
          line({ accountCode: "3100", side: "credit", amountMinor: myr("100.00") + 1n }),
        ]),
      ),
    ).toThrow(LedgerError);

    try {
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: 100n }),
          line({ accountCode: "3100", side: "credit", amountMinor: 99n }),
        ]),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(LedgerError);
      expect((error as LedgerError).code).toBe("UNBALANCED");
    }
  });

  it("rejects structural problems", () => {
    expect(() => postJournalEntry(entry({}, [line({ side: "debit", amountMinor: myr("1.00") })]))).toThrow(
      /at least two lines/,
    );
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: 0n }),
          line({ accountCode: "3100", side: "credit", amountMinor: myr("1.00") }),
        ]),
      ),
    ).toThrow(/positive bigint/);
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: -1n }),
          line({ accountCode: "3100", side: "credit", amountMinor: myr("1.00") }),
        ]),
      ),
    ).toThrow(LedgerError);
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: 100 as unknown as bigint }),
          line({ accountCode: "3100", side: "credit", amountMinor: 100 as unknown as bigint }),
        ]),
      ),
    ).toThrow(/not a float|positive bigint/);
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: myr("1.00"), currency: "MYR" }),
          line({ accountCode: "3100", side: "credit", amountMinor: myr("1.00"), currency: "SGD" }),
        ]),
      ),
    ).toThrow(/mixes MYR and SGD/);
    expect(() => postJournalEntry(entry({ memo: "  " }))).toThrow(/memo/);
    expect(() => postJournalEntry(entry({ entryDate: "2026-04-31" }))).toThrow(/not a real calendar date/);
    expect(() => postJournalEntry(entry({ entryDate: "08-04-2026" }))).toThrow(/YYYY-MM-DD/);
    expect(() =>
      postJournalEntry(
        entry({}, [
          line({ side: "debit", amountMinor: myr("1.00"), accountCode: " " }),
          line({ accountCode: "3100", side: "credit", amountMinor: myr("1.00") }),
        ]),
      ),
    ).toThrow(/no account/);
  });

  it("rejects incomplete quantity dimensions", () => {
    const base = line({
      accountCode: "1310",
      side: "debit",
      amountMinor: myr("1.00"),
      quantityMinor: toMinor("1", 18),
    });
    const credit = line({ accountCode: "1000", side: "credit", amountMinor: myr("1.00") });
    expect(() => postJournalEntry(entry({}, [base, credit]))).toThrow(/assetCode/);
    expect(() => postJournalEntry(entry({}, [{ ...base, assetCode: "ETH" }, credit]))).toThrow(/direction/);
    expect(() =>
      postJournalEntry(
        entry({}, [{ ...base, assetCode: "ETH", quantityDirection: "in" }, credit]),
      ),
    ).toThrow(/sourceId/);
    expect(() =>
      postJournalEntry(
        entry({}, [
          {
            ...base,
            assetCode: "ETH",
            quantityDirection: "in",
            sourceId: "src",
            quantityMinor: 0n,
          },
          credit,
        ]),
      ),
    ).toThrow(/quantityMinor/);
  });
});
