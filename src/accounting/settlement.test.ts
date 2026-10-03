import { describe, expect, it } from "vitest";
import { SETTLEMENT_ACCOUNTS, proposalBalances, proposeSettlementJournal, settlementReference } from "./settlement";

const base = {
  reference: "INV-1",
  entryDate: "2026-10-03",
  memo: "Supplier payment",
  currency: "MYR",
  amountMinor: 2_300_000n,
  stablecoinMinor: 500_000_000n,
  payableAlreadyBooked: false,
};

describe("proposeSettlementJournal", () => {
  it("recognizes an expense when no payable was booked", () => {
    const proposal = proposeSettlementJournal(base);
    expect(proposal.treatment).toBe("recognizes_expense");
    expect(proposal.lines[0]!.accountCode).toBe(SETTLEMENT_ACCOUNTS.expense);
    expect(proposal.lines[0]!.side).toBe("debit");
    expect(proposal.lines[1]!.accountCode).toBe(SETTLEMENT_ACCOUNTS.stablecoins);
    expect(proposalBalances(proposal)).toBe(true);
  });

  it("clears the payable instead of recognizing the expense twice", () => {
    const proposal = proposeSettlementJournal({ ...base, payableAlreadyBooked: true });
    expect(proposal.treatment).toBe("clears_payable");
    expect(proposal.lines[0]!.accountCode).toBe(SETTLEMENT_ACCOUNTS.billsToPay);
    expect(proposalBalances(proposal)).toBe(true);
  });

  it("refuses a non-positive amount", () => {
    expect(() => proposeSettlementJournal({ ...base, amountMinor: 0n })).toThrow(/positive/i);
  });
});

describe("settlementReference", () => {
  it("is stable per signature and purpose", () => {
    const sig = "5j7s".repeat(20);
    expect(settlementReference(sig)).toBe(settlementReference(sig));
    expect(settlementReference(sig, "fee")).not.toBe(settlementReference(sig, "supplier_payment"));
  });
});
