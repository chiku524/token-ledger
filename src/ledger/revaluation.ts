/**
 * Period-end revaluation (mark-to-market) as a *proposed* journal. This module
 * only computes the difference between carrying value and market value per
 * asset and returns balanced journal lines; it never posts. The caller posts the
 * result through the normal immutable posting path, so a revaluation is a
 * deliberate, reviewable entry and a reversal of a wrong one is the correction.
 *
 * Quantity is never changed by revaluation: only the carrying amount moves.
 */
import type { JournalLineInput } from "./types";
import { valueHoldings } from "./valuation";
import type { AssetPrice } from "./pricing";

export interface RevaluationHolding {
  assetCode: string;
  /** Units held at the asset's scale. */
  quantityMinor: bigint;
  quantityScale: number;
  /** Carrying amount in the functional currency's minor units. */
  carryingMinor: bigint;
}

export interface RevaluationLine {
  assetCode: string;
  carryingMinor: bigint;
  marketMinor: bigint;
  /** marketMinor - carryingMinor. Positive is a gain, negative a loss. */
  differenceMinor: bigint;
}

export interface RevaluationProposal {
  quoteCurrency: string;
  asOf: string;
  lines: RevaluationLine[];
  /** One balanced entry for the net difference, or empty when nothing moved. */
  journalLines: JournalLineInput[];
  /** Net marketMinor - carryingMinor. Positive is a gain, negative a loss. */
  netMinor: bigint;
  /** Assets that could not be priced, so they are excluded from the proposal. */
  unpriced: string[];
  staleAssetCodes: string[];
}

/**
 * Compute a revaluation proposal as one balanced entry for the net difference:
 * a gain debits the asset account and credits the gain account; a loss debits
 * the loss account and credits the asset account. Per-asset detail is kept on
 * `lines`. An asset with no price is left out and reported, so a stale or
 * missing price never invents a value.
 */
export function proposeRevaluation(input: {
  prices: readonly AssetPrice[];
  holdings: readonly RevaluationHolding[];
  quoteCurrency: string;
  assetAccountCode: string;
  gainAccountCode: string;
  lossAccountCode: string;
  asOf: string;
  stalenessMs?: number;
}): RevaluationProposal {
  const summary = valueHoldings({
    prices: input.prices,
    holdings: input.holdings.map((holding) => ({
      assetCode: holding.assetCode,
      quantityMinor: holding.quantityMinor,
      quantityScale: holding.quantityScale,
    })),
    quoteCurrency: input.quoteCurrency,
    asOf: input.asOf,
    stalenessMs: input.stalenessMs,
  });

  const carryingByAsset = new Map(input.holdings.map((holding) => [holding.assetCode, holding]));
  const lines: RevaluationLine[] = [];
  const staleAssetCodes: string[] = [];
  let netMinor = 0n;
  for (const row of summary.rows) {
    const holding = carryingByAsset.get(row.assetCode);
    if (!holding) continue;
    if (row.age === "stale") staleAssetCodes.push(row.assetCode);
    const differenceMinor = row.valueMinor - holding.carryingMinor;
    if (differenceMinor === 0n) continue;
    lines.push({ assetCode: row.assetCode, carryingMinor: holding.carryingMinor, marketMinor: row.valueMinor, differenceMinor });
    netMinor += differenceMinor;
  }

  const journalLines: JournalLineInput[] = [];
  if (netMinor > 0n) {
    journalLines.push({ accountCode: input.assetAccountCode, side: "debit", amountMinor: netMinor, currency: input.quoteCurrency });
    journalLines.push({ accountCode: input.gainAccountCode, side: "credit", amountMinor: netMinor, currency: input.quoteCurrency });
  } else if (netMinor < 0n) {
    journalLines.push({ accountCode: input.lossAccountCode, side: "debit", amountMinor: -netMinor, currency: input.quoteCurrency });
    journalLines.push({ accountCode: input.assetAccountCode, side: "credit", amountMinor: -netMinor, currency: input.quoteCurrency });
  }

  return {
    quoteCurrency: input.quoteCurrency,
    asOf: input.asOf,
    lines,
    journalLines,
    netMinor,
    unpriced: summary.unpriced.map((row) => row.assetCode),
    staleAssetCodes,
  };
}
