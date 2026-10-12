import { describe, expect, it } from "vitest";
import { toJournalSyncBatch } from "@/adapters";
import { assertUniqueEntryIds, assetCarryingSchedule, toMinor, trialBalance } from "@/ledger";
import { exampleBooks } from "./example-books";

const ENT = "ent_asset_manager_a";

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

  it("carries BUIDL, USDC, and gold at the amounts implied by the example journals", () => {
    const rows = assetCarryingSchedule(exampleBooks.journalEntries, exampleBooks.accounts, ENT);
    expect(rows.find((row) => row.assetCode === "BUIDL")).toMatchObject({
      measurementBasis: "IFRS 9",
      carryingMinor: toMinor("2012500.00", 2),
      quantityMinor: toMinor("2012500", 6),
    });
    expect(rows.find((row) => row.assetCode === "USDC")).toMatchObject({
      measurementBasis: "IFRS 9",
      carryingMinor: toMinor("1499550.00", 2),
      quantityMinor: toMinor("1499550", 6),
    });
    expect(rows.find((row) => row.assetCode === "XAU")).toMatchObject({
      measurementBasis: "IAS 38",
      carryingMinor: toMinor("750000.00", 2),
      quantityMinor: toMinor("312.5", 18),
    });
  });

  it("keeps observed balances on read-only connections, separate from the journal", () => {
    expect(exampleBooks.connections.every((connection) => connection.scopes === "balances,movements")).toBe(true);
    for (const source of exampleBooks.sources) {
      const connection = exampleBooks.connections.find((item) => item.id === source.connectionId);
      expect(connection?.entityId).toBe(source.entityId);
    }
    expect(exampleBooks.connections.filter((connection) => connection.status === "pending")).toHaveLength(0);
    const snapshot = (sourceId: string) =>
      exampleBooks.balanceSnapshots.find((row) => row.sourceId === sourceId)?.quantityMinor;
    expect(snapshot("src_buidl_eth")).toBe(toMinor("1512500", 6));
    expect(snapshot("src_buidl_sol")).toBe(toMinor("500000", 6));
    expect(snapshot("src_gold_hl")).toBe(toMinor("5", 18));
    expect(exampleBooks.sources.filter((source) => source.connectionId === "conn_blackrock_eth")).toHaveLength(1);
  });

  it("leaves one unmatched on-chain receipt as a reconciliation exception", () => {
    const exceptions = exampleBooks.reconciliations.filter((row) => row.status === "exception");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.sourceTransactionId).toBe("stx_a_unbooked");
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
    expect(batch.functionalCurrency).toBe("USD");
    expect(batch.entries).toHaveLength(entries.length);
    expect(batch.entries.reduce((sum, entry) => sum + entry.lines.length, 0)).toBe(
      entries.reduce((sum, entry) => sum + entry.lines.length, 0),
    );
  });
});
