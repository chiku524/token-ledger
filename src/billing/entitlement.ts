/**
 * Project on-chain mandate state into an entitlement that gates app features.
 *
 * The chain is the source of truth. This module derives an entitlement from a
 * mandate's projected state and never from a client claim: a mandate that is not
 * finalized on-chain grants nothing, no matter what a request says. Paid access
 * continues to its recorded end even after a renewal is revoked or the
 * authorization expires, which is why the entitlement separates "will renew"
 * from "access until".
 *
 * Pure: it takes state and a clock, and returns the entitlement. Persistence and
 * the finalized-only check live in the projection layer.
 */
export interface MandateState {
  /** Finalization of the mandate projection on-chain. */
  finalization: "pending" | "finalized" | "failed";
  revoked: boolean;
  /** When the authorization stops allowing new coverage. */
  authorizationExpiry: Date;
  /** Coverage already paid for, the end of granted access. */
  paidThrough: Date;
  /** Cumulative amount debited, in USDC minor units. */
  totalDebitedMinor: bigint;
  /** Lifetime cap, in USDC minor units. */
  maxTotalDebitMinor: bigint;
  generation: bigint;
}

export interface Entitlement {
  /** Whether the mandate will collect another period. */
  renewing: boolean;
  /** Access is granted until this instant, funded or not (paid-through). */
  accessUntil: Date;
  /** Remaining authorization, never negative. */
  capRemainingMinor: bigint;
  generation: bigint;
  /** The instant the projection was computed. */
  asOf: Date;
  /** Null when renewing; otherwise why it is not. */
  reason: "not_finalized" | "revoked" | "expired" | null;
}

/**
 * Derive the entitlement. `now` is passed in so the result is deterministic in
 * tests and stable within a single projection pass.
 */
export function deriveEntitlement(state: MandateState, now: Date): Entitlement {
  const capRemainingMinor =
    state.totalDebitedMinor >= state.maxTotalDebitMinor ? 0n : state.maxTotalDebitMinor - state.totalDebitedMinor;

  // A mandate that is not finalized grants nothing, even if it looks active.
  if (state.finalization !== "finalized") {
    return {
      renewing: false,
      accessUntil: state.paidThrough,
      capRemainingMinor,
      generation: state.generation,
      asOf: now,
      reason: "not_finalized",
    };
  }

  if (state.revoked) {
    return {
      renewing: false,
      accessUntil: state.paidThrough,
      capRemainingMinor,
      generation: state.generation,
      asOf: now,
      reason: "revoked",
    };
  }

  if (state.authorizationExpiry.getTime() <= now.getTime()) {
    return {
      renewing: false,
      accessUntil: state.paidThrough,
      capRemainingMinor,
      generation: state.generation,
      asOf: now,
      reason: "expired",
    };
  }

  // Active: renews while the cap remains and the authorization holds.
  const renewing = capRemainingMinor > 0n;
  return {
    renewing,
    accessUntil: renewing ? state.authorizationExpiry : state.paidThrough,
    capRemainingMinor,
    generation: state.generation,
    asOf: now,
    reason: renewing ? null : "expired",
  };
}

/** Whether the mandate currently grants access at `now`. */
export function hasAccess(entitlement: Entitlement, now: Date): boolean {
  return entitlement.accessUntil.getTime() > now.getTime();
}

/** A stable key for an entitlement projection: mandate and generation. */
export function entitlementKey(mandateId: string, generation: bigint): string {
  return `${mandateId}:${generation.toString()}`;
}
