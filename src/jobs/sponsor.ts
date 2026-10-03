/**
 * Sponsor-fee policy. A sponsor can pay network fees without holding approval
 * keys, but only within limits: a per-transaction fee ceiling, a per-entity
 * quota, and an allow-list of the instructions it will sponsor. The plan
 * requires restricting sponsored requests to decoded allowed instructions,
 * fee ceilings and organization quotas.
 *
 * Pure: the caller supplies the decoded instruction and the fee estimate.
 */
import type { PreviewAction } from "@/contracts/preview";

export interface SponsorPolicy {
  /** Maximum fee (lamports) the sponsor will pay for one transaction. */
  perTxFeeCeilingLamports: bigint;
  /** Maximum total sponsored fee (lamports) per organization per UTC day. */
  perOrgDailyCeilingLamports: bigint;
  /** The actions the sponsor will pay for. Anything else is customer-paid. */
  allowedActions: readonly PreviewAction[];
}

export interface SponsorRequest {
  action: PreviewAction;
  /** The estimated fee for this transaction, in lamports. */
  feeEstimateLamports: bigint;
  /** The organization's already-spent sponsored fee for the current UTC day. */
  orgSpentTodayLamports: bigint;
}

export type SponsorDecision =
  | { sponsored: true }
  | { sponsored: false; reason: "action_not_sponsored" | "over_tx_ceiling" | "over_org_quota" };

/**
 * Whether the sponsor will pay for this transaction. A customer-paid fallback
 * always exists, so a refusal is not a failure — it returns the reason so the
 * UI can ask the customer to pay.
 */
export function decideSponsorship(policy: SponsorPolicy, request: SponsorRequest): SponsorDecision {
  if (!policy.allowedActions.includes(request.action)) return { sponsored: false, reason: "action_not_sponsored" };
  if (request.feeEstimateLamports > policy.perTxFeeCeilingLamports) return { sponsored: false, reason: "over_tx_ceiling" };
  if (request.orgSpentTodayLamports + request.feeEstimateLamports > policy.perOrgDailyCeilingLamports) {
    return { sponsored: false, reason: "over_org_quota" };
  }
  return { sponsored: true };
}

/** The conservative default policy: sponsor only collection, small fees. */
export function defaultSponsorPolicy(): SponsorPolicy {
  return {
    perTxFeeCeilingLamports: 50_000n, // ~0.00005 SOL
    perOrgDailyCeilingLamports: 10_000_000n, // ~0.01 SOL/day
    allowedActions: ["billing.collect", "treasury.execute"],
  };
}
