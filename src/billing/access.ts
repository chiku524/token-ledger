/**
 * Organization-level subscription access, derived from a customer's on-chain
 * mandates. Service Balance is the platform subscription: the paid mandate
 * enables the subscribed features (plan §1A). This resolver turns the
 * per-mandate entitlements into one answer for the organization, from the
 * projected (finalized) state only — never a client claim.
 *
 * Pure: it takes entitlements and a clock. It never gates a customer's money:
 * withdrawal and treasury exit are always available (see `assertAccess` callers);
 * only *features* are gated.
 */
import type { Entitlement } from "./entitlement";

export interface OrganizationAccess {
  /** Whether the organization currently has subscription access. */
  active: boolean;
  /** The latest access end across the organization's mandates, or null if none. */
  accessUntil: Date | null;
  /** Whether any mandate will still renew. */
  renewing: boolean;
  /** Why access is off, when it is. Null when active. */
  reason: "no_mandate" | "not_finalized" | "revoked" | "expired" | null;
}

/**
 * Resolve access from every entitlement the organization has. Access is active if
 * any mandate grants access at `now`; the answer carries the furthest access end
 * and whether anything renews. No entitlements means no access, with
 * `no_mandate` so the UI can prompt a subscribe rather than report a failure.
 */
export function resolveAccess(entitlements: readonly Entitlement[], now: Date): OrganizationAccess {
  if (entitlements.length === 0) {
    return { active: false, accessUntil: null, renewing: false, reason: "no_mandate" };
  }

  let accessUntil: Date | null = null;
  let renewing = false;
  for (const entitlement of entitlements) {
    if (accessUntil === null || entitlement.accessUntil.getTime() > accessUntil.getTime()) {
      accessUntil = entitlement.accessUntil;
    }
    if (entitlement.renewing && entitlement.accessUntil.getTime() > now.getTime()) renewing = true;
  }

  const active = accessUntil !== null && accessUntil.getTime() > now.getTime();
  if (active) return { active: true, accessUntil, renewing, reason: null };

  // Not active: report the most actionable reason. Prefer the strongest signal —
  // a revoked or not-finalized mandate beats a plain expiry.
  const reasons = new Set(entitlements.map((entitlement) => entitlement.reason).filter(Boolean));
  const reason = reasons.has("revoked")
    ? "revoked"
    : reasons.has("not_finalized")
      ? "not_finalized"
      : "expired";
  return { active: false, accessUntil, renewing: false, reason };
}

/** A short label for the access state, for a status badge. */
export function accessLabel(access: OrganizationAccess): string {
  if (access.active) return access.renewing ? "Subscribed · renewing" : "Subscribed";
  if (access.reason === "no_mandate") return "Not subscribed";
  if (access.reason === "not_finalized") return "Awaiting confirmation";
  if (access.reason === "revoked") return "Renewal cancelled";
  return "Expired";
}
