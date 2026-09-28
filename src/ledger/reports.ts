import type { LedgerAccount, PostedJournalEntry, Side } from "./types";
import { LedgerError } from "./types";

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: LedgerAccount["type"];
  normalBalance: Side;
  measurementBasis: string | null;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface TrialBalance {
  entityId: string;
  currency: string | null;
  rows: TrialBalanceRow[];
  debitTotal: bigint;
  creditTotal: bigint;
}

export interface CarryingAmountRow {
  assetCode: string;
  measurementBasis: string;
  currency: string;
  carryingMinor: bigint;
  quantityMinor: bigint;
}

export function netBalanceMinor(row: Pick<TrialBalanceRow, "debitMinor" | "creditMinor" | "normalBalance">): bigint {
  return row.normalBalance === "debit" ? row.debitMinor - row.creditMinor : row.creditMinor - row.debitMinor;
}

export function trialBalance(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  entityId: string,
): TrialBalance {
  const chart = accounts.filter((account) => account.entityId === entityId);
  const totals = new Map<string, { debitMinor: bigint; creditMinor: bigint }>();
  for (const account of chart) {
    totals.set(account.code, { debitMinor: 0n, creditMinor: 0n });
  }

  const relevant = entries.filter((entry) => entry.entityId === entityId);
  const currencies = new Set(relevant.map((entry) => entry.currency));
  if (currencies.size > 1) {
    throw new LedgerError(
      "MIXED_CURRENCY",
      `Entity ${entityId} has journal entries in more than one functional currency.`,
    );
  }

  for (const entry of relevant) {
    for (const line of entry.lines) {
      const bucket = totals.get(line.accountCode);
      if (!bucket) {
        throw new LedgerError(
          "UNKNOWN_ACCOUNT",
          `Entry ${entry.reference} posts to ${line.accountCode}, which is not on the chart for ${entityId}.`,
        );
      }
      if (line.side === "debit") bucket.debitMinor += line.amountMinor;
      else bucket.creditMinor += line.amountMinor;
    }
  }

  const rows = chart
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((account) => {
      const bucket = totals.get(account.code) ?? { debitMinor: 0n, creditMinor: 0n };
      return {
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        measurementBasis: account.measurementBasis,
        debitMinor: bucket.debitMinor,
        creditMinor: bucket.creditMinor,
      };
    });

  let debitTotal = 0n;
  let creditTotal = 0n;
  for (const row of rows) {
    debitTotal += row.debitMinor;
    creditTotal += row.creditMinor;
  }

  return {
    entityId,
    currency: relevant[0]?.currency ?? null,
    rows,
    debitTotal,
    creditTotal,
  };
}

/**
 * Carrying amounts for accounts that declare a measurement basis (IAS 38, IAS 2, IFRS 9).
 * Debit-normal assets increase on debit. Quantity follows in/out on the line.
 */
export function assetCarryingSchedule(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  entityId: string,
): CarryingAmountRow[] {
  const chart = new Map(
    accounts.filter((account) => account.entityId === entityId).map((account) => [account.code, account]),
  );
  const grouped = new Map<string, CarryingAmountRow>();

  for (const entry of entries) {
    if (entry.entityId !== entityId) continue;
    for (const line of entry.lines) {
      const account = chart.get(line.accountCode);
      if (!account) {
        throw new LedgerError("UNKNOWN_ACCOUNT", `Unknown account ${line.accountCode} on ${entry.reference}.`);
      }
      if (!account.measurementBasis) continue;
      if (!line.assetCode) {
        throw new LedgerError(
          "MISSING_ASSET",
          `Entry ${entry.reference} posts to ${account.code} (${account.measurementBasis}) without an assetCode.`,
        );
      }

      const key = `${account.measurementBasis}|${line.assetCode}|${line.currency}`;
      const row = grouped.get(key) ?? {
        assetCode: line.assetCode,
        measurementBasis: account.measurementBasis,
        currency: line.currency,
        carryingMinor: 0n,
        quantityMinor: 0n,
      };
      const amountSign = line.side === account.normalBalance ? 1n : -1n;
      row.carryingMinor += amountSign * line.amountMinor;
      if (line.quantityMinor !== undefined) {
        const quantitySign = line.quantityDirection === "out" ? -1n : 1n;
        row.quantityMinor += quantitySign * line.quantityMinor;
      }
      grouped.set(key, row);
    }
  }

  return [...grouped.values()]
    .filter((row) => row.carryingMinor !== 0n || row.quantityMinor !== 0n)
    .sort((a, b) => a.measurementBasis.localeCompare(b.measurementBasis) || a.assetCode.localeCompare(b.assetCode));
}
