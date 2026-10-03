import { describe, expect, it } from "vitest";
import { deriveEntitlement, entitlementKey, hasAccess, type MandateState } from "./entitlement";

const NOW = new Date("2026-10-03T00:00:00.000Z");
const DAY = 86_400_000;

function state(overrides: Partial<MandateState> = {}): MandateState {
  return {
    finalization: "finalized",
    revoked: false,
    authorizationExpiry: new Date(NOW.getTime() + 200 * DAY),
    paidThrough: new Date(NOW.getTime() + 20 * DAY),
    totalDebitedMinor: 20_000_000n,
    maxTotalDebitMinor: 100_000_000n,
    generation: 0n,
    ...overrides,
  };
}

describe("deriveEntitlement", () => {
  it("grants renewing access with cap remaining for an active mandate", () => {
    const e = deriveEntitlement(state(), NOW);
    expect(e.renewing).toBe(true);
    expect(e.reason).toBeNull();
    expect(e.capRemainingMinor).toBe(80_000_000n);
    expect(hasAccess(e, NOW)).toBe(true);
  });

  it("grants nothing when the mandate is not finalized, even if it looks active", () => {
    const e = deriveEntitlement(state({ finalization: "pending" }), NOW);
    expect(e.renewing).toBe(false);
    expect(e.reason).toBe("not_finalized");
  });

  it("stops renewal on revoke but keeps access to paid-through", () => {
    const e = deriveEntitlement(state({ revoked: true }), NOW);
    expect(e.renewing).toBe(false);
    expect(e.reason).toBe("revoked");
    // Access continues to the paid-through instant, not merely "now".
    expect(e.accessUntil.getTime()).toBe(NOW.getTime() + 20 * DAY);
    expect(hasAccess(e, NOW)).toBe(true);
    expect(hasAccess(e, new Date(NOW.getTime() + 21 * DAY))).toBe(false);
  });

  it("stops renewal on authorization expiry", () => {
    const e = deriveEntitlement(state({ authorizationExpiry: new Date(NOW.getTime() - 1) }), NOW);
    expect(e.renewing).toBe(false);
    expect(e.reason).toBe("expired");
  });

  it("does not renew when the cap is exhausted", () => {
    const e = deriveEntitlement(state({ totalDebitedMinor: 100_000_000n }), NOW);
    expect(e.capRemainingMinor).toBe(0n);
    expect(e.renewing).toBe(false);
  });

  it("never reports a negative remaining cap", () => {
    const e = deriveEntitlement(state({ totalDebitedMinor: 120_000_000n }), NOW);
    expect(e.capRemainingMinor).toBe(0n);
  });
});

describe("entitlementKey", () => {
  it("distinguishes generations", () => {
    expect(entitlementKey("m1", 0n)).not.toBe(entitlementKey("m1", 1n));
  });
});
