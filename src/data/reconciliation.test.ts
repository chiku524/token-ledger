import { describe, expect, it } from "vitest";
import { toMinor } from "@/ledger";
import type { BooksSourceTransaction } from "./books";
import { buildReconciliations, candidateJournalLines } from "./reconciliation";
import { exampleBooks, exampleJournalEntries } from "./example-books";

const transactions: BooksSourceTransaction[] = [
  { id: "stx_a", organizationId: "o", entityId: "e", sourceId: "s", externalId: "ext-a", occurredOn: "2026-06-01", assetCode: "ETH", direction: "in", quantityMinor: toMinor("1", 18), description: "" },
];

describe("buildReconciliations with overrides", () => {
  it("is an exception with no ledger movement and no overrides", () => {
    const rows = buildReconciliations("o", transactions, [], "2026-06-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("exception");
  });

  it("a manual match pairs an exception and marks it matched", () => {
    const rows = buildReconciliations("o", transactions, [], "2026-06-01", [
      { sourceTransactionId: "stx_a", journalEntryId: "je_x", journalLineNumber: 1, kind: "match", note: "Reviewer confirmed." },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "matched", journalEntryId: "je_x", journalLineNumber: 1 });
  });

  it("an unmatch forces an automatic match back to an exception", () => {
    // Use the example books, which contain a real matched pair.
    const matched = exampleBooks.sourceTransactions.find((transaction) =>
      exampleBooks.reconciliations.some((row) => row.sourceTransactionId === transaction.id && row.status === "matched"),
    );
    if (!matched) throw new Error("expected a matched example transaction");
    const rows = buildReconciliations("org_harbourline", exampleBooks.sourceTransactions, exampleJournalEntries, exampleBooks.period.start, [
      { sourceTransactionId: matched.id, journalEntryId: null, journalLineNumber: null, kind: "unmatch", note: "Not this line." },
    ]);
    const row = rows.find((item) => item.sourceTransactionId === matched.id);
    expect(row?.status).toBe("exception");
    expect(row?.journalEntryId).toBeNull();
  });
});

describe("candidateJournalLines", () => {
  it("lists only movements on the same entity, source, asset, and direction", () => {
    const movements = [
      { id: "m1", entityId: "e", sourceId: "s", assetCode: "ETH", direction: "in" as const, quantityMinor: 1n, journalEntryId: "je_x", lineNumber: 1 },
      { id: "m2", entityId: "e", sourceId: "s", assetCode: "ETH", direction: "out" as const, quantityMinor: 1n, journalEntryId: "je_y", lineNumber: 2 },
      { id: "m3", entityId: "e", sourceId: "s", assetCode: "SOL", direction: "in" as const, quantityMinor: 1n, journalEntryId: "je_z", lineNumber: 1 },
    ];
    const candidates = candidateJournalLines(
      { entityId: "e", sourceId: "s", assetCode: "ETH", direction: "in" },
      movements,
      (id) => id,
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(["je_x:1"]);
  });
});
