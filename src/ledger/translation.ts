/**
 * IAS 21 period-end translation. Assets and liabilities translate at the
 * closing rate; income and expense at the average rate for the period; the
 * difference is a translation reserve in equity, so the presented group stays in
 * balance. This is separate from the single-rate consolidation in fx.ts, which
 * remains for a quick view.
 *
 * Rates are rational, never floats, and the reserve is derived, not stored.
 */
import type { LedgerAccount, PostedJournalEntry } from "./types";
import { trialBalance } from "./reports";
import { findAppliedRate, translateWithRate, type AppliedRate, type FxRate } from "./fx";

export interface TranslatedEntity {
  entityId: string;
  entityName: string;
  functionalCurrency: string;
  included: boolean;
  detail: string;
  closingApplied: AppliedRate | null;
  averageApplied: AppliedRate | null;
  /** Net monetary difference created by using two rates, booked to the reserve. */
  reserveMinor: bigint;
}

export interface TranslatedTrialBalance {
  presentationCurrency: string;
  asOf: string;
  rows: Array<{ code: string; name: string; debitMinor: bigint; creditMinor: bigint }>;
  entities: TranslatedEntity[];
  reserveMinor: bigint;
  debitTotal: bigint;
  creditTotal: bigint;
}

const RESERVE_CODE = "3200";

function isProfitAndLoss(type: LedgerAccount["type"]): boolean {
  return type === "income" || type === "expense";
}

/**
 * Translate a group with IAS 21 methodology. Every entity that has both a
 * closing and an average rate is included; one missing rate leaves that entity
 * out and reports why, so a partial group is never presented as complete.
 */
export function translateGroupIas21(input: {
  entities: readonly { id: string; name: string; functionalCurrency: string; parentEntityId: string | null }[];
  entries: readonly PostedJournalEntry[];
  accounts: readonly LedgerAccount[];
  rates: readonly FxRate[];
  /** Period start, for the average rate. */
  periodStart: string;
  /** Period end, the closing date. */
  closingDate: string;
  presentationCurrency: string;
  fiatScale?: number;
}): TranslatedTrialBalance {
  const scale = input.fiatScale ?? 2;
  const accountType = new Map(input.accounts.map((account) => [`${account.entityId}:${account.code}`, account.type]));
  const buckets = new Map<string, { code: string; name: string; debitMinor: bigint; creditMinor: bigint }>();
  const entities: TranslatedEntity[] = [];
  let reserveMinor = 0n;

  for (const entity of input.entities) {
    const sameCurrency = entity.functionalCurrency === input.presentationCurrency;
    const closing = sameCurrency
      ? null
      : findAppliedRate(input.rates, entity.functionalCurrency, input.presentationCurrency, input.closingDate);
    // The average rate is taken at period start as the representative rate here.
    const average = sameCurrency
      ? null
      : findAppliedRate(input.rates, entity.functionalCurrency, input.presentationCurrency, input.periodStart);
    if (!sameCurrency && (!closing || !average)) {
      entities.push({
        entityId: entity.id,
        entityName: entity.name,
        functionalCurrency: entity.functionalCurrency,
        included: false,
        detail: `Needs both a closing rate (${input.closingDate}) and an average rate (${input.periodStart}).`,
        closingApplied: closing,
        averageApplied: average,
        reserveMinor: 0n,
      });
      continue;
    }

    const report = trialBalance(input.entries, input.accounts, entity.id);
    for (const row of report.rows) {
      const type = accountType.get(`${entity.id}:${row.code}`);
      const atAverage = type !== undefined && isProfitAndLoss(type);
      const applied = sameCurrency ? null : (atAverage ? average : closing);
      const debitMinor = sameCurrency ? row.debitMinor : translateWithRate(row.debitMinor, applied as AppliedRate, scale);
      const creditMinor = sameCurrency ? row.creditMinor : translateWithRate(row.creditMinor, applied as AppliedRate, scale);
      const bucket = buckets.get(row.code) ?? { code: row.code, name: row.name, debitMinor: 0n, creditMinor: 0n };
      bucket.debitMinor += debitMinor;
      bucket.creditMinor += creditMinor;
      buckets.set(row.code, bucket);
    }
    entities.push({
      entityId: entity.id,
      entityName: entity.name,
      functionalCurrency: entity.functionalCurrency,
      included: true,
      detail: sameCurrency ? `Already ${input.presentationCurrency}.` : "Closing rate for assets/liabilities, average for income/expense.",
      closingApplied: closing,
      averageApplied: average,
      reserveMinor: 0n,
    });
  }

  // Using the closing rate for the balance sheet and the average rate for the
  // P&L leaves the group slightly out of balance; that residual is the
  // translation reserve, which is what IAS 21 books to equity.
  let debitTotal = [...buckets.values()].reduce((sum, row) => sum + row.debitMinor, 0n);
  let creditTotal = [...buckets.values()].reduce((sum, row) => sum + row.creditMinor, 0n);
  reserveMinor = debitTotal - creditTotal;
  if (reserveMinor !== 0n) {
    const bucket = buckets.get(RESERVE_CODE) ?? {
      code: RESERVE_CODE,
      name: "Translation reserve",
      debitMinor: 0n,
      creditMinor: 0n,
    };
    if (reserveMinor > 0n) bucket.creditMinor += reserveMinor;
    else bucket.debitMinor += -reserveMinor;
    buckets.set(RESERVE_CODE, bucket);
  }

  const rows = [...buckets.values()]
    .filter((row) => row.debitMinor !== 0n || row.creditMinor !== 0n)
    .sort((a, b) => a.code.localeCompare(b.code));
  debitTotal = rows.reduce((sum, row) => sum + row.debitMinor, 0n);
  creditTotal = rows.reduce((sum, row) => sum + row.creditMinor, 0n);

  return {
    presentationCurrency: input.presentationCurrency,
    asOf: input.closingDate,
    rows,
    entities,
    reserveMinor,
    debitTotal,
    creditTotal,
  };
}
