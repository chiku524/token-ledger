/**
 * Settlement → journal proposal. A finalized settlement becomes a reviewable,
 * balanced journal proposal through the existing posting path; it never posts
 * directly. A worker must not call `postJournalEntry` — the accountant reviews
 * and approves the draft, and only then does the immutable entry exist.
 *
 * The chain gave us one settlement for one invoice. The app's job is to make sure
 * that settlement is recognized once and correctly:
 *
 *   - If the invoice already created a payable (the supplier invoice was booked),
 *     settlement clears the payable rather than recognizing the expense again.
 *   - Otherwise, settlement recognizes the expense.
 *
 * Pure: it produces account codes and amounts; the caller resolves them to the
 * entity's chart and writes a draft.
 */
export interface SettlementForAccounting {
  reference: string;
  entryDate: string;
  memo: string;
  /** ISO currency of the entity's books (the functional currency). */
  currency: string;
  /** The settlement amount in minor units of the functional currency. */
  amountMinor: bigint;
  /** The USDC value of the payment, in minor units; may equal amountMinor. */
  stablecoinMinor: bigint;
  /** Whether the supplier payable was already recognized before settlement. */
  payableAlreadyBooked: boolean;
}

export interface ProposedLine {
  accountCode: string;
  side: "debit" | "credit";
  amountMinor: bigint;
  currency: string;
  memo: string;
}

export interface ProposedJournal {
  reference: string;
  entryDate: string;
  memo: string;
  currency: string;
  lines: ProposedLine[];
  /** Why this shape was chosen. */
  treatment: "clears_payable" | "recognizes_expense";
}

/** Chart codes this module uses. They exist in the entity chart template. */
export const SETTLEMENT_ACCOUNTS = {
  billsToPay: "2100",
  stablecoins: "1330",
  expense: "5100",
} as const;

/**
 * Build the proposal. Balanced by construction: the payable/expense debit equals
 * the stablecoin credit.
 */
export function proposeSettlementJournal(input: SettlementForAccounting): ProposedJournal {
  if (input.amountMinor <= 0n) throw new Error("A settlement amount must be positive.");
  const treatment = input.payableAlreadyBooked ? "clears_payable" : "recognizes_expense";
  const debitCode = treatment === "clears_payable" ? SETTLEMENT_ACCOUNTS.billsToPay : SETTLEMENT_ACCOUNTS.expense;
  const debitMemo =
    treatment === "clears_payable"
      ? `Clear payable for ${input.reference}.`
      : `Supplier payment for ${input.reference}.`;
  return {
    reference: input.reference,
    entryDate: input.entryDate,
    memo: input.memo,
    currency: input.currency,
    treatment,
    lines: [
      { accountCode: debitCode, side: "debit", amountMinor: input.amountMinor, currency: input.currency, memo: debitMemo },
      {
        accountCode: SETTLEMENT_ACCOUNTS.stablecoins,
        side: "credit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        memo: `USDC settled on ${input.reference}.`,
      },
    ],
  };
}

/** Whether a proposal is balanced, so it can be saved as a draft. */
export function proposalBalances(proposal: ProposedJournal): boolean {
  const debit = proposal.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + line.amountMinor, 0n);
  const credit = proposal.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + line.amountMinor, 0n);
  return debit === credit && debit > 0n;
}

/**
 * The stable idempotency reference for a settlement's journal. One settlement
 * yields one posting per purpose; this is the reference for the main posting.
 */
export function settlementReference(signature: string, purpose = "supplier_payment"): string {
  const short = signature.slice(0, 16);
  return `sol-${purpose}-${short}`;
}
