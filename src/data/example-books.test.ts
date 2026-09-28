import { describe, expect, it } from "vitest";
import { toJournalSyncBatch } from "@/adapters";
import { assertUniqueEntryIds, assetCarryingSchedule, toMinor, trialBalance } from "@/ledger";
import { exampleBooks } from "./example-books";

describe("example books", () => {
  it("is labelled as example data and posts a balanced set of journals", () => {
    expect(exampleBooks.notice.toLowerCase()).toContain("example");
    expect(exampleBooks.organization.origin).toBe("example");
    assertUniqueEntryIds(exampleBooks.journalEntries);

    for (const entity of exampleBooks.entities) {
      const report = trialBalance(exampleBooks.journalEntries, exampleBooks.accounts, entity.id);
      expect(report.debitTotal).toBe(report.creditTotal);
      expect(report.currency).toBe(entity.functionalCurrency);
    }
  });

  it("carries ETH, USDC, and SOL at the amounts implied by the example journals", () => {
    const my = assetCarryingSchedule(exampleBooks.journalEntries, exampleBooks.accounts, "ent_harbourline_my");
    const eth = my.find((row) => row.assetCode === "ETH");
    const usdc = my.find((row) => row.assetCode === "USDC");
    expect(eth).toMatchObject({
      measurementBasis: "IAS 38",
      carryingMinor: toMinor("31624.00", 2),
      quantityMinor: toMinor("2.548", 18),
    });
    expect(usdc).toMatchObject({
      measurementBasis: "IFRS 9",
      carryingMinor: toMinor("42000.00", 2),
      quantityMinor: toMinor("10000", 6),
    });

    const sg = assetCarryingSchedule(exampleBooks.journalEntries, exampleBooks.accounts, "ent_harbourline_sg");
    expect(sg).toEqual([
      expect.objectContaining({
        assetCode: "SOL",
        measurementBasis: "IAS 38",
        carryingMinor: toMinor("18000.00", 2),
        quantityMinor: toMinor("100", 9),
      }),
    ]);
  });

  it("leaves one unmatched on-chain receipt as a reconciliation exception", () => {
    const exceptions = exampleBooks.reconciliations.filter((row) => row.status === "exception");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.sourceTransactionId).toBe("stx_my_unbooked");
    expect(exceptions[0]?.journalEntryId).toBeNull();
    expect(exampleBooks.reconciliations.filter((row) => row.status === "matched").length).toBe(
      exampleBooks.sourceTransactions.length - 1,
    );
  });

  it("builds an accounting sync payload without dropping lines", () => {
    const entity = exampleBooks.entities[0];
    if (!entity) throw new Error("missing entity");
    const entries = exampleBooks.journalEntries.filter((entry) => entry.entityId === entity.id);
    const batch = toJournalSyncBatch(entity, entries);
    expect(batch.functionalCurrency).toBe("MYR");
    expect(batch.entries).toHaveLength(entries.length);
    expect(batch.entries.reduce((sum, entry) => sum + entry.lines.length, 0)).toBe(
      entries.reduce((sum, entry) => sum + entry.lines.length, 0),
    );
  });
});
