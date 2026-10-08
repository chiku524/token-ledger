import { describe, expect, it } from "vitest";
import {
  canTakeConnectionTour,
  gettingStartedPhases,
  gettingStartedStep,
  needsConnectionCheck,
  resolveGettingStartedPhase,
} from "./getting-started";

describe("canTakeConnectionTour", () => {
  it("allows owners and admins who connect venues", () => {
    expect(canTakeConnectionTour("owner")).toBe(true);
    expect(canTakeConnectionTour("admin")).toBe(true);
    expect(canTakeConnectionTour("accountant")).toBe(false);
    expect(canTakeConnectionTour("viewer")).toBe(false);
  });
});

describe("gettingStartedPhases", () => {
  it("covers the day-to-day path from connect through reports", () => {
    expect(gettingStartedPhases()).toEqual([
      "connect",
      "check",
      "holdings",
      "match",
      "journal",
      "reports",
    ]);
  });
});

describe("resolveGettingStartedPhase", () => {
  it("starts at connect when there is no live connection", () => {
    expect(resolveGettingStartedPhase({ connections: [], observedBalanceCount: 0 })).toBe("connect");
    expect(
      resolveGettingStartedPhase({
        connections: [{ status: "revoked", lastSyncedAt: "2026-10-01T00:00:00.000Z" }],
        observedBalanceCount: 0,
      }),
    ).toBe("connect");
  });

  it("asks for Check until a connection has synced", () => {
    expect(
      resolveGettingStartedPhase({
        connections: [{ status: "pending", lastSyncedAt: null }],
        observedBalanceCount: 0,
      }),
    ).toBe("check");
  });

  it("walks Holdings → Match → Journal → Reports after Check", () => {
    const progress = {
      connections: [{ status: "healthy" as const, lastSyncedAt: "2026-10-05T10:00:00.000Z" }],
      observedBalanceCount: 3,
    };
    expect(resolveGettingStartedPhase(progress, 0)).toBe("holdings");
    expect(resolveGettingStartedPhase(progress, 1)).toBe("match");
    expect(resolveGettingStartedPhase(progress, 2)).toBe("journal");
    expect(resolveGettingStartedPhase(progress, 3)).toBe("reports");
    expect(resolveGettingStartedPhase(progress, 99)).toBe("reports");
  });
});

describe("needsConnectionCheck", () => {
  it("is true when any live connection has never synced", () => {
    expect(
      needsConnectionCheck([
        { status: "healthy", lastSyncedAt: "2026-10-05T10:00:00.000Z" },
        { status: "pending", lastSyncedAt: null },
      ]),
    ).toBe(true);
    expect(needsConnectionCheck([{ status: "healthy", lastSyncedAt: "2026-10-05T10:00:00.000Z" }])).toBe(false);
  });
});

describe("gettingStartedStep", () => {
  it("explains an empty Holdings list after Check", () => {
    const step = gettingStartedStep("holdings", {
      connections: [{ status: "healthy", lastSyncedAt: "2026-10-05T10:00:00.000Z" }],
      observedBalanceCount: 0,
    });
    expect(step.title).toContain("Balances land");
    expect(step.body).toContain("no holdings");
  });

  it("names the observed balance count when coins exist", () => {
    const step = gettingStartedStep("holdings", {
      connections: [{ status: "healthy", lastSyncedAt: "2026-10-05T10:00:00.000Z" }],
      observedBalanceCount: 2,
    });
    expect(step.body).toContain("2 quantities");
  });

  it("points Match, Journal, and Reports at the right pages", () => {
    const empty = { connections: [], observedBalanceCount: 0 };
    expect(gettingStartedStep("match", empty).href).toBe("/dashboard/reconciliation");
    expect(gettingStartedStep("journal", empty).href).toBe("/dashboard/ledger");
    expect(gettingStartedStep("reports", empty).href).toBe("/dashboard/reports");
  });
});
