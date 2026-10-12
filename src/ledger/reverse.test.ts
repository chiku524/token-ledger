import { describe, expect, it } from "vitest";
import { exampleJournalEntries } from "@/data/example-books";
import { toMinor } from "./money";
import { trialBalance } from "./reports";
import { reverseJournalEntry } from "./reverse";
import { exampleAccounts } from "@/data/example-books";

describe("reverseJournalEntry", () => {
  it("flips sides and quantity direction and leaves the original entry untouched", () => {
    const original = exampleJournalEntries.find((entry) => entry.id === "je_a_buidl");
    if (!original) throw new Error("missing example entry");
    const reversal = reverseJournalEntry(original, {
      id: "je_reverse",
      reference: "JE-2026-008",
      entryDate: "2026-06-30",
      memo: "Reverse the example BUIDL acquisition.",
    });

    expect(original.lines[0]?.side).toBe("debit");
    expect(reversal.lines[0]?.side).toBe("credit");
    expect(reversal.lines[0]?.quantityDirection).toBe("out");
    expect(reversal.lines[1]?.side).toBe("debit");
    expect(reversal.debitMinor).toBe(original.debitMinor);
    expect(reversal.entityId).toBe(original.entityId);
    expect(original.memo).toContain("acquire");

    const report = trialBalance([...exampleJournalEntries, reversal], exampleAccounts, original.entityId);
    expect(report.debitTotal).toBe(report.creditTotal);
    const tokens = report.rows.find((row) => row.code === "1330");
    expect(tokens && tokens.debitMinor - tokens.creditMinor).toBe(toMinor("1512050.00", 2));
  });
});
