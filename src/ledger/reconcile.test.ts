import { describe, expect, it } from "vitest";
import { toMinor } from "./money";
import { postJournalEntry } from "./post";
import { ledgerQuantityMovements, reconcileMovements } from "./reconcile";

describe("reconcileMovements", () => {
  const entry = postJournalEntry({
    id: "je_1",
    entityId: "ent_my",
    reference: "JE-1",
    entryDate: "2026-04-08",
    memo: "Buy ETH",
    lines: [
      {
        accountCode: "1310",
        side: "debit",
        amountMinor: toMinor("10.00", 2),
        currency: "MYR",
        quantityMinor: toMinor("1", 18),
        assetCode: "ETH",
        quantityDirection: "in",
        sourceId: "src_exchange",
      },
      { accountCode: "1000", side: "credit", amountMinor: toMinor("10.00", 2), currency: "MYR" },
    ],
  });

  it("matches an exact source transaction and flags both kinds of break", () => {
    const movements = ledgerQuantityMovements([entry]);
    const results = reconcileMovements(
      [
        {
          id: "stx_match",
          entityId: "ent_my",
          sourceId: "src_exchange",
          assetCode: "ETH",
          direction: "in",
          quantityMinor: toMinor("1", 18),
        },
        {
          id: "stx_extra",
          entityId: "ent_my",
          sourceId: "src_hot",
          assetCode: "ETH",
          direction: "in",
          quantityMinor: toMinor("0.1", 18),
        },
      ],
      [
        ...movements,
        {
          id: "je_orphan:1",
          entityId: "ent_my",
          sourceId: "src_cold",
          assetCode: "ETH",
          direction: "out",
          quantityMinor: toMinor("0.2", 18),
        },
      ],
    );

    expect(results.filter((row) => row.status === "matched")).toHaveLength(1);
    expect(results.filter((row) => row.status === "exception")).toHaveLength(2);
    expect(results.find((row) => row.sourceTransactionId === "stx_extra")?.ledgerMovementId).toBeNull();
    expect(results.find((row) => row.ledgerMovementId === "je_orphan:1")?.sourceTransactionId).toBeNull();
  });

  it("does not reuse one ledger movement for two identical source rows", () => {
    const movement = {
      id: "move_1",
      entityId: "ent_my",
      sourceId: "src_exchange",
      assetCode: "ETH",
      direction: "in" as const,
      quantityMinor: 1n,
    };
    const source = { ...movement, id: "stx_a" };
    const results = reconcileMovements(
      [source, { ...source, id: "stx_b" }],
      [movement],
    );
    expect(results.filter((row) => row.status === "matched")).toHaveLength(1);
    expect(results.filter((row) => row.status === "exception")).toHaveLength(1);
  });
});
