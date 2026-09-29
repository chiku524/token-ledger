import { describe, expect, it } from "vitest";
import { journalCsv, reconciliationCsv, trialBalanceCsv } from "./csv";

describe("report CSV", () => {
  it("quotes commas and writes decimal amounts", () => {
    const trial = trialBalanceCsv({
      entityName: "Harbourline, MY",
      currency: "MYR",
      rows: [{ code: "1000", name: "Cash", debitMinor: 1n, creditMinor: 0n, netMinor: 1n }],
      formatAmount: (amount) => amount.toString(),
    });
    expect(trial.startsWith("\uFEFF")).toBe(true);
    expect(trial).toContain('"Harbourline, MY",MYR,1000,Cash,1,0,1');

    const journal = journalCsv([
      {
        entryDate: "2026-04-02",
        reference: "JE-1",
        entityName: "Parent",
        currency: "MYR",
        accountCode: "1000",
        accountName: "Cash",
        side: "debit",
        amount: "10.00",
        assetCode: "",
        quantity: "",
        sourceName: "",
        memo: 'Said "hello"',
        postedBy: "Amina",
        reverses: "",
      },
    ]);
    expect(journal).toContain('"Said ""hello"""');

    const reconciliation = reconciliationCsv([
      {
        status: "exception",
        sourceName: "Hot wallet",
        externalId: "chain-1",
        journalReference: "",
        assetCode: "ETH",
        direction: "in",
        quantity: "0.1",
        note: "No journal",
      },
    ]);
    expect(reconciliation).toContain("exception,Hot wallet,chain-1,,ETH,in,0.1,No journal");
  });
});
