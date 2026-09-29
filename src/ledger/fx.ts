/**
 * Foreign-exchange translation for consolidation.
 * Rates are rational numbers, never binary floats.
 * 1 major unit of base currency = numerator / 10^scale major units of quote currency.
 */
import type { LedgerAccount, PostedJournalEntry } from "./types";
import { trialBalance, type TrialBalanceRow } from "./reports";

export interface FxRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  numerator: bigint;
  scale: number;
  asOf: string;
  origin: "example" | "live";
  note: string;
}

export interface ConsolidatedRow {
  code: string;
  name: string;
  debitMinor: bigint;
  creditMinor: bigint;
  /** Plug so per-line half-up rounding cannot leave the group out of balance. */
  rounding: boolean;
}

export interface EntityTranslation {
  entityId: string;
  entityName: string;
  functionalCurrency: string;
  included: boolean;
  rateLabel: string;
}

export interface ConsolidatedTrialBalance {
  presentationCurrency: string;
  asOf: string;
  rows: ConsolidatedRow[];
  entities: EntityTranslation[];
  debitTotal: bigint;
  creditTotal: bigint;
}

export function selectFxRate(
  rates: readonly FxRate[],
  baseCurrency: string,
  quoteCurrency: string,
  asOf: string,
): FxRate | null {
  const candidates = rates.filter(
    (rate) => rate.baseCurrency === baseCurrency && rate.quoteCurrency === quoteCurrency && rate.asOf <= asOf,
  );
  candidates.sort((a, b) => {
    if (a.asOf !== b.asOf) return a.asOf < b.asOf ? 1 : -1;
    if (a.origin !== b.origin) return a.origin === "live" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

/**
 * Convert a minor-unit amount. Both scales are the currencies' minor-unit scales (2 for MYR and SGD).
 * Half-up, away from zero on a tie.
 */
export function translateMinor(amountMinor: bigint, rate: Pick<FxRate, "numerator" | "scale">, fromScale: number, toScale: number): bigint {
  if (!Number.isInteger(rate.scale) || rate.scale < 0 || rate.scale > 12) {
    throw new Error("FX rate scale must be an integer from 0 to 12.");
  }
  if (!Number.isInteger(fromScale) || !Number.isInteger(toScale) || fromScale < 0 || toScale < 0) {
    throw new Error("Currency scales must be non-negative integers.");
  }
  if (rate.numerator <= 0n) throw new Error("FX rate numerator must be positive.");

  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const numerator = absolute * rate.numerator * 10n ** BigInt(toScale);
  const denominator = 10n ** BigInt(rate.scale + fromScale);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function formatFxRate(rate: Pick<FxRate, "baseCurrency" | "quoteCurrency" | "numerator" | "scale">): string {
  const denominator = 10n ** BigInt(rate.scale);
  const whole = rate.numerator / denominator;
  const fraction = (rate.numerator % denominator).toString().padStart(rate.scale, "0");
  const body = rate.scale === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
  return `1 ${rate.baseCurrency} = ${body} ${rate.quoteCurrency}`;
}

export function consolidateTrialBalances(input: {
  entities: readonly { id: string; name: string; functionalCurrency: string; parentEntityId: string | null }[];
  entries: readonly PostedJournalEntry[];
  accounts: readonly LedgerAccount[];
  rates: readonly FxRate[];
  presentationCurrency: string;
  asOf: string;
  fiatScale?: number;
}): ConsolidatedTrialBalance {
  const scale = input.fiatScale ?? 2;
  const parentId = input.entities.find((entity) => entity.parentEntityId === null)?.id;
  const buckets = new Map<string, ConsolidatedRow>();
  const translations: EntityTranslation[] = [];

  for (const entity of input.entities) {
    const sameCurrency = entity.functionalCurrency === input.presentationCurrency;
    const rate = sameCurrency
      ? null
      : selectFxRate(input.rates, entity.functionalCurrency, input.presentationCurrency, input.asOf);
    if (!sameCurrency && !rate) {
      translations.push({
        entityId: entity.id,
        entityName: entity.name,
        functionalCurrency: entity.functionalCurrency,
        included: false,
        rateLabel: `No rate from ${entity.functionalCurrency} to ${input.presentationCurrency} on or before ${input.asOf}.`,
      });
      continue;
    }

    translations.push({
      entityId: entity.id,
      entityName: entity.name,
      functionalCurrency: entity.functionalCurrency,
      included: true,
      rateLabel: sameCurrency ? `Already ${input.presentationCurrency}.` : formatFxRate(rate as FxRate),
    });

    const report = trialBalance(input.entries, input.accounts, entity.id);
    for (const row of report.rows) {
      const debitMinor = sameCurrency ? row.debitMinor : translateMinor(row.debitMinor, rate as FxRate, scale, scale);
      const creditMinor = sameCurrency ? row.creditMinor : translateMinor(row.creditMinor, rate as FxRate, scale, scale);
      const current = buckets.get(row.code) ?? {
        code: row.code,
        name: row.name,
        debitMinor: 0n,
        creditMinor: 0n,
        rounding: false,
      };
      if (entity.id === parentId) current.name = row.name;
      current.debitMinor += debitMinor;
      current.creditMinor += creditMinor;
      buckets.set(row.code, current);
    }
  }

  const rows = [...buckets.values()]
    .filter((row) => row.debitMinor !== 0n || row.creditMinor !== 0n)
    .sort((a, b) => a.code.localeCompare(b.code));

  let debitTotal = 0n;
  let creditTotal = 0n;
  for (const row of rows) {
    debitTotal += row.debitMinor;
    creditTotal += row.creditMinor;
  }
  if (debitTotal !== creditTotal) {
    const gap = debitTotal - creditTotal;
    rows.push({
      code: "FX-ROUND",
      name: "Translation rounding",
      debitMinor: gap < 0n ? -gap : 0n,
      creditMinor: gap > 0n ? gap : 0n,
      rounding: true,
    });
    if (gap < 0n) debitTotal += -gap;
    else creditTotal += gap;
  }

  return {
    presentationCurrency: input.presentationCurrency,
    asOf: input.asOf,
    rows,
    entities: translations,
    debitTotal,
    creditTotal,
  };
}

export function consolidatedNet(row: Pick<TrialBalanceRow, "debitMinor" | "creditMinor">): bigint {
  return row.debitMinor - row.creditMinor;
}
