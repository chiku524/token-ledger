/**
 * Presented financial statements derived from posted journals: a Balance Sheet
 * grouped by asset class, and a Profit & Loss for the period. Pure and
 * bigint-only, like the rest of the ledger layer.
 *
 * The Balance Sheet balances because the current-period result is shown inside
 * equity: in a double-entry trial balance assets + expense = liabilities +
 * equity + income, so assets = liabilities + equity + (income - expense).
 */
import { netBalanceMinor, trialBalance, type TrialBalanceRow } from "./reports";
import type { LedgerAccount, PostedJournalEntry } from "./types";
import { LedgerError } from "./types";

export interface StatementLine {
  key: string;
  label: string;
  amountMinor: bigint;
}

export interface FinancialStatements {
  entityId: string;
  currency: string | null;
  balanceSheet: {
    assetClassRows: StatementLine[];
    otherAssetRows: StatementLine[];
    liabilityRows: StatementLine[];
    equityRows: StatementLine[];
    assetTotalMinor: bigint;
    liabilityTotalMinor: bigint;
    equityTotalMinor: bigint;
    /** Period profit or loss carried into equity, so the sheet balances. */
    resultMinor: bigint;
    inBalance: boolean;
  };
  profitAndLoss: {
    incomeRows: StatementLine[];
    expenseRows: StatementLine[];
    incomeTotalMinor: bigint;
    expenseTotalMinor: bigint;
    /** Income less expense. Positive is a profit. */
    netMinor: bigint;
  };
}

/** Asset class per asset code; unknown codes fall to "unspecified". */
export interface AssetClassRef {
  code: string;
  assetClass: string;
}

const CLASS_LABELS: Record<string, string> = {
  crypto: "Crypto",
  stablecoin: "Stablecoins",
  rwa: "Tokenised real-world assets",
  fiat: "Fiat",
  unspecified: "Other tokens",
};

export function assetClassLabel(assetClass: string): string {
  return CLASS_LABELS[assetClass] ?? assetClass;
}

/**
 * Build the Balance Sheet and Profit & Loss for one entity from posted entries.
 * Token asset accounts are grouped by the class of the assets their lines hold;
 * other asset accounts (cash) are listed on their own. Income and expense make
 * up the P&L. Amounts are attributed to a class directly from the line's asset,
 * never estimated.
 */
export function financialStatements(
  entries: readonly PostedJournalEntry[],
  accounts: readonly LedgerAccount[],
  assets: readonly AssetClassRef[],
  entityId: string,
): FinancialStatements {
  const report = trialBalance(entries, accounts, entityId);
  const chart = new Map(accounts.filter((account) => account.entityId === entityId).map((account) => [account.code, account]));
  const classByCode = new Map(assets.map((asset) => [asset.code, asset.assetClass.trim() || "unspecified"]));

  const assetClassTotals = new Map<string, bigint>();
  const otherAssetCodes = new Set<string>();

  for (const entry of entries) {
    if (entry.entityId !== entityId) continue;
    for (const entryLine of entry.lines) {
      const account = chart.get(entryLine.accountCode);
      if (!account) {
        throw new LedgerError("UNKNOWN_ACCOUNT", `Unknown account ${entryLine.accountCode} on ${entry.reference}.`);
      }
      if (account.type !== "asset") continue;
      if (!account.measurementBasis) {
        otherAssetCodes.add(account.code);
        continue;
      }
      if (!entryLine.assetCode) {
        throw new LedgerError(
          "MISSING_ASSET",
          `Entry ${entry.reference} posts to ${account.code} (${account.measurementBasis}) without an assetCode.`,
        );
      }
      const assetClass = classByCode.get(entryLine.assetCode) ?? "unspecified";
      const sign = entryLine.side === account.normalBalance ? 1n : -1n;
      assetClassTotals.set(assetClass, (assetClassTotals.get(assetClass) ?? 0n) + sign * entryLine.amountMinor);
    }
  }

  const assetClassRows = [...assetClassTotals.entries()]
    .filter(([, amount]) => amount !== 0n)
    .map(([assetClass, amount]) => ({ key: assetClass, label: assetClassLabel(assetClass), amountMinor: amount }))
    .sort((a, b) => (a.amountMinor === b.amountMinor ? a.label.localeCompare(b.label) : a.amountMinor > b.amountMinor ? -1 : 1));

  const otherAssetRows: StatementLine[] = [];
  const liabilityRows: StatementLine[] = [];
  const equityRows: StatementLine[] = [];
  const incomeRows: StatementLine[] = [];
  const expenseRows: StatementLine[] = [];

  for (const row of report.rows) {
    const amount = netBalanceMinor(row);
    if (amount === 0n) continue;
    if (row.type === "asset") {
      if (otherAssetCodes.has(row.code)) otherAssetRows.push(line(row, amount));
    } else if (row.type === "liability") {
      liabilityRows.push(line(row, amount));
    } else if (row.type === "equity") {
      equityRows.push(line(row, amount));
    } else if (row.type === "income") {
      incomeRows.push(line(row, amount));
    } else if (row.type === "expense") {
      expenseRows.push(line(row, amount));
    }
  }

  const incomeTotalMinor = incomeRows.reduce((sum, row) => sum + row.amountMinor, 0n);
  const expenseTotalMinor = expenseRows.reduce((sum, row) => sum + row.amountMinor, 0n);
  const netMinor = incomeTotalMinor - expenseTotalMinor;

  const assetTotalMinor =
    assetClassRows.reduce((sum, row) => sum + row.amountMinor, 0n) +
    otherAssetRows.reduce((sum, row) => sum + row.amountMinor, 0n);
  const liabilityTotalMinor = liabilityRows.reduce((sum, row) => sum + row.amountMinor, 0n);
  const equityTotalMinor = equityRows.reduce((sum, row) => sum + row.amountMinor, 0n) + netMinor;

  return {
    entityId,
    currency: report.currency,
    balanceSheet: {
      assetClassRows,
      otherAssetRows: sortRows(otherAssetRows),
      liabilityRows: sortRows(liabilityRows),
      equityRows: sortRows(equityRows),
      assetTotalMinor,
      liabilityTotalMinor,
      equityTotalMinor,
      resultMinor: netMinor,
      inBalance: assetTotalMinor === liabilityTotalMinor + equityTotalMinor,
    },
    profitAndLoss: {
      incomeRows: sortRows(incomeRows),
      expenseRows: sortRows(expenseRows),
      incomeTotalMinor,
      expenseTotalMinor,
      netMinor,
    },
  };
}

function line(row: TrialBalanceRow, amountMinor: bigint): StatementLine {
  return { key: row.code, label: `${row.code} ${row.name}`, amountMinor };
}

function sortRows(rows: StatementLine[]): StatementLine[] {
  return rows.slice().sort((a, b) => a.key.localeCompare(b.key));
}
