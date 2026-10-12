import { describe, expect, it } from "vitest";
import { exampleBooks } from "@/data/example-books";
import { toMinor } from "./money";
import { financialStatements } from "./statements";

const ENT = "ent_asset_manager_a";
const sen = (amount: string) => toMinor(amount, 2);

describe("financialStatements", () => {
  const { journalEntries, accounts, assets } = exampleBooks;

  it("balances the balance sheet and groups assets by class", () => {
    const statements = financialStatements(journalEntries, accounts, assets, ENT);
    const { balanceSheet } = statements;
    expect(balanceSheet.inBalance).toBe(true);
    expect(balanceSheet.assetTotalMinor).toBe(balanceSheet.liabilityTotalMinor + balanceSheet.equityTotalMinor);
    expect(balanceSheet.assetClassRows.map((row) => [row.key, row.amountMinor])).toEqual([
      ["stablecoin", sen("3512050.00")],
      ["crypto", sen("750000.00")],
    ]);
    // Cash (1000) is not a token account, so it stays on its own.
    expect(balanceSheet.otherAssetRows.map((row) => [row.key, row.amountMinor])).toEqual([["1000", sen("750000.00")]]);
  });

  it("reports profit and loss and feeds the result into equity", () => {
    const statements = financialStatements(journalEntries, accounts, assets, ENT);
    const { profitAndLoss, balanceSheet } = statements;
    // BUIDL income 12,500; fee expense 450 => net 12,050 profit.
    expect(profitAndLoss.incomeTotalMinor).toBe(sen("12500.00"));
    expect(profitAndLoss.expenseTotalMinor).toBe(sen("450.00"));
    expect(profitAndLoss.netMinor).toBe(sen("12050.00"));
    expect(balanceSheet.resultMinor).toBe(sen("12050.00"));
    // Equity is capital 5,000,000 plus the period result 12,050.
    expect(balanceSheet.equityTotalMinor).toBe(sen("5012050.00"));
  });

  it("reports the single example company in USD", () => {
    const statements = financialStatements(journalEntries, accounts, assets, ENT);
    expect(statements.currency).toBe("USD");
    expect(statements.balanceSheet.inBalance).toBe(true);
  });
});
