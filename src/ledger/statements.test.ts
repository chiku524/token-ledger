import { describe, expect, it } from "vitest";
import { exampleBooks } from "@/data/example-books";
import { toMinor } from "./money";
import { financialStatements } from "./statements";

const MY = "ent_harbourline_my";
const SG = "ent_harbourline_sg";
const sen = (amount: string) => toMinor(amount, 2);

describe("financialStatements", () => {
  const { journalEntries, accounts, assets } = exampleBooks;

  it("balances the balance sheet and groups assets by class", () => {
    const statements = financialStatements(journalEntries, accounts, assets, MY);
    const { balanceSheet } = statements;
    expect(balanceSheet.inBalance).toBe(true);
    expect(balanceSheet.assetTotalMinor).toBe(balanceSheet.liabilityTotalMinor + balanceSheet.equityTotalMinor);
    expect(balanceSheet.assetClassRows.map((row) => [row.key, row.amountMinor])).toEqual([
      ["stablecoin", sen("42000.00")],
      ["crypto", sen("31624.00")],
    ]);
    // Cash (1000) is not a token account, so it stays on its own.
    expect(balanceSheet.otherAssetRows.map((row) => [row.key, row.amountMinor])).toEqual([["1000", sen("427000.00")]]);
  });

  it("reports profit and loss and feeds the result into equity", () => {
    const statements = financialStatements(journalEntries, accounts, assets, MY);
    const { profitAndLoss, balanceSheet } = statements;
    // Staking reward income 650, fee expense 26 => net 624 profit.
    expect(profitAndLoss.incomeTotalMinor).toBe(sen("650.00"));
    expect(profitAndLoss.expenseTotalMinor).toBe(sen("26.00"));
    expect(profitAndLoss.netMinor).toBe(sen("624.00"));
    expect(balanceSheet.resultMinor).toBe(sen("624.00"));
    // Equity is capital 500000 plus the period result 624.
    expect(balanceSheet.equityTotalMinor).toBe(sen("500624.00"));
  });

  it("keeps a second entity in its own currency", () => {
    const statements = financialStatements(journalEntries, accounts, assets, SG);
    expect(statements.currency).toBe("SGD");
    expect(statements.balanceSheet.inBalance).toBe(true);
    expect(statements.balanceSheet.assetClassRows.map((row) => [row.key, row.amountMinor])).toEqual([
      ["crypto", sen("18000.00")],
    ]);
    expect(statements.profitAndLoss.netMinor).toBe(0n);
  });
});
