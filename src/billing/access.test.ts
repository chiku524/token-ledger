import { describe, expect, it } from "vitest";
import { accessLabel, resolveAccess } from "./access";
import type { Entitlement } from "./entitlement";

const NOW = new Date("2026-06-15T12:00:00Z");
const future = new Date("2026-07-15T00:00:00Z");
const past = new Date("2026-05-15T00:00:00Z");

function ent(overrides: Partial<Entitlement>): Entitlement {
  return {
    renewing: true,
    accessUntil: future,
    capRemainingMinor: 1_000n,
    generation: 0n,
    asOf: NOW,
    reason: null,
    ...overrides,
  };
}

describe("resolveAccess", () => {
  it("is not subscribed with no mandates", () => {
    expect(resolveAccess([], NOW)).toEqual({ active: false, accessUntil: null, renewing: false, reason: "no_mandate" });
  });

  it("is active when any mandate grants access, and reports the furthest end", () => {
    const access = resolveAccess(
      [
        ent({ accessUntil: future }),
        ent({ accessUntil: new Date("2026-08-01T00:00:00Z"), renewing: false }),
      ],
      NOW,
    );
    expect(access.active).toBe(true);
    expect(access.accessUntil?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(access.renewing).toBe(true);
    expect(access.reason).toBeNull();
  });

  it("does not count a renewing flag whose access already lapsed", () => {
    const access = resolveAccess([ent({ accessUntil: past, renewing: true })], NOW);
    expect(access.active).toBe(false);
    expect(access.renewing).toBe(false);
  });

  it("prefers the strongest reason when inactive", () => {
    expect(resolveAccess([ent({ accessUntil: past, renewing: false, reason: "expired" })], NOW).reason).toBe("expired");
    expect(
      resolveAccess([ent({ accessUntil: past, renewing: false, reason: null }), ent({ accessUntil: past, renewing: false, reason: "revoked" })], NOW).reason,
    ).toBe("revoked");
    expect(
      resolveAccess([ent({ accessUntil: past, renewing: false, reason: "expired" }), ent({ accessUntil: past, renewing: false, reason: "not_finalized" })], NOW).reason,
    ).toBe("not_finalized");
  });
});

describe("accessLabel", () => {
  it("labels each state", () => {
    expect(accessLabel({ active: true, accessUntil: future, renewing: true, reason: null })).toBe("Subscribed · renewing");
    expect(accessLabel({ active: true, accessUntil: future, renewing: false, reason: null })).toBe("Subscribed");
    expect(accessLabel({ active: false, accessUntil: null, renewing: false, reason: "no_mandate" })).toBe("Not subscribed");
    expect(accessLabel({ active: false, accessUntil: past, renewing: false, reason: "revoked" })).toBe("Renewal cancelled");
    expect(accessLabel({ active: false, accessUntil: past, renewing: false, reason: "expired" })).toBe("Expired");
  });
});
