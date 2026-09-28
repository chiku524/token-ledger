import { describe, expect, it } from "vitest";
import { toMinor } from "./money";
import { postJournalEntry } from "./post";
import { assetCarryingSchedule, netBalanceMinor, trialBalance } from "./reports";
import type { LedgerAccount } from "./types";

const entityId = "ent_my";

const accounts: LedgerAccount[] = [
  { entityId, code: "1000", name: "Cash", type: "asset", normalBalance: "debit", measurementBasis: null },
  {
    entityId,
    code: "1310",
    name: "Digital assets",
    type: "asset",
    normalBalance: "debit",
    measurementBasis: "IAS 38",
  },
  { entityId, code: "3100", name: "Capital", type: "equity", normalBalance: "credit", measurementBasis: null },
  { entityId, code: "4100", name: "Yield", type: "income", normalBalance: "credit", measurementBasis: null },
];

describe("trialBalance", () => {
  const entries = [
    postJournalEntry({
      id: "je_1",
      entityId,
      reference: "JE-1",
      entryDate: "2026-04-02",
      memo: "Capital",
      lines: [
        { accountCode: "1000", side: "debit", amountMinor: toMinor("100.00", 2), currency: "MYR" },
        { accountCode: "3100", side: "credit", amountMinor: toMinor("100.00", 2), currency: "MYR" },
      ],
    }),
    postJournalEntry({
      id: "je_2",
      entityId,
      reference: "JE-2",
      entryDate: "2026-04-08",
      memo: "Buy",
      lines: [
        {
          accountCode: "1310",
          side: "debit",
          amountMinor: toMinor("40.00", 2),
          currency: "MYR",
          quantityMinor: toMinor("1", 18),
          assetCode: "ETH",
          quantityDirection: "in",
          sourceId: "src_hot",
        },
        { accountCode: "1000", side: "credit", amountMinor: toMinor("40.00", 2), currency: "MYR" },
      ],
    }),
  ];

  it("balances and nets a debit-normal cash account", () => {
    const report = trialBalance(entries, accounts, entityId);
    expect(report.debitTotal).toBe(report.creditTotal);
    const cash = report.rows.find((row) => row.code === "1000");
    expect(cash && netBalanceMinor(cash)).toBe(toMinor("60.00", 2));
    const unused = report.rows.find((row) => row.code === "4100");
    expect(unused && netBalanceMinor(unused)).toBe(0n);
  });

  it("rejects an account that is not on the chart", () => {
    const stray = postJournalEntry({
      id: "je_3",
      entityId,
      reference: "JE-3",
      entryDate: "2026-04-09",
      memo: "Unknown",
      lines: [
        { accountCode: "9999", side: "debit", amountMinor: 1n, currency: "MYR" },
        { accountCode: "1000", side: "credit", amountMinor: 1n, currency: "MYR" },
      ],
    });
    expect(() => trialBalance([stray], accounts, entityId)).toThrow(/not on the chart/);
  });
});

describe("assetCarryingSchedule", () => {
  it("nets quantity and functional carrying amount by measurement basis", () => {
    const entries = [
      postJournalEntry({
        id: "je_buy",
        entityId,
        reference: "JE-BUY",
        entryDate: "2026-04-08",
        memo: "Buy",
        lines: [
          {
            accountCode: "1310",
            side: "debit",
            amountMinor: toMinor("40.00", 2),
            currency: "MYR",
            quantityMinor: toMinor("1", 18),
            assetCode: "ETH",
            quantityDirection: "in",
            sourceId: "src_hot",
          },
          { accountCode: "1000", side: "credit", amountMinor: toMinor("40.00", 2), currency: "MYR" },
        ],
      }),
      postJournalEntry({
        id: "je_fee",
        entityId,
        reference: "JE-FEE",
        entryDate: "2026-04-09",
        memo: "Fee",
        lines: [
          { accountCode: "4100", side: "debit", amountMinor: toMinor("1.00", 2), currency: "MYR" },
          {
            accountCode: "1310",
            side: "credit",
            amountMinor: toMinor("1.00", 2),
            currency: "MYR",
            quantityMinor: toMinor("0.01", 18),
            assetCode: "ETH",
            quantityDirection: "out",
            sourceId: "src_hot",
          },
        ],
      }),
    ];

    const [eth] = assetCarryingSchedule(entries, accounts, entityId);
    expect(eth).toMatchObject({
      assetCode: "ETH",
      measurementBasis: "IAS 38",
      carryingMinor: toMinor("39.00", 2),
      quantityMinor: toMinor("0.99", 18),
    });
  });
});
