import { describe, expect, it } from "vitest";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import {
  canTakeConnectionTour,
  gettingStartedPhases,
  gettingStartedStep,
  needsConnectionCheck,
  phaseIndex,
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

  it("asks for Check until the first connection has synced", () => {
    expect(
      resolveGettingStartedPhase({
        connections: [{ status: "pending", lastSyncedAt: null }],
        observedBalanceCount: 0,
      }),
    ).toBe("check");
  });

  it("does not trap on Check when another connection already synced", () => {
    expect(
      resolveGettingStartedPhase({
        connections: [
          { status: "healthy", lastSyncedAt: "2026-10-05T10:00:00.000Z" },
          { status: "pending", lastSyncedAt: null },
        ],
        observedBalanceCount: 1,
      }),
    ).toBe("holdings");
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

describe("the guide for an individual", () => {
  const checked = {
    connections: [{ status: "healthy" as const, lastSyncedAt: "2026-10-05T10:00:00.000Z" }],
    observedBalanceCount: 3,
  };

  it("has five steps with no Match", () => {
    expect(gettingStartedPhases("individual")).toEqual(["connect", "check", "holdings", "journal", "reports"]);
    expect(phaseIndex("reports", "individual")).toBe(4);
  });

  it("keeps all six steps for an organization, with or without the type", () => {
    const all = ["connect", "check", "holdings", "match", "journal", "reports"];
    expect(gettingStartedPhases("organization")).toEqual(all);
    expect(gettingStartedPhases()).toEqual(all);
    expect(phaseIndex("reports")).toBe(5);
  });

  it("walks Holdings, Journal, Reports after Check", () => {
    expect(resolveGettingStartedPhase(checked, 0, "individual")).toBe("holdings");
    expect(resolveGettingStartedPhase(checked, 1, "individual")).toBe("journal");
    expect(resolveGettingStartedPhase(checked, 2, "individual")).toBe("reports");
    expect(resolveGettingStartedPhase(checked, 99, "individual")).toBe("reports");
  });

  it("still starts on connect and check", () => {
    expect(resolveGettingStartedPhase({ connections: [], observedBalanceCount: 0 }, 3, "individual")).toBe("connect");
  });

  it("does not mention approvals or combined roll-ups", () => {
    for (const phase of gettingStartedPhases("individual")) {
      const step = gettingStartedStep(phase, checked, "individual");
      expect(`${step.title} ${step.body}`).not.toMatch(/approv|combined|companies|matching/i);
    }
  });

  it("leaves an organization's wording as it was", () => {
    expect(gettingStartedStep("journal", checked).body).toBe(gettingStartedStep("journal", checked, "organization").body);
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

describe("the Activity wording", () => {
  const checked = { connections: [{ status: "healthy" as const, lastSyncedAt: "2026-01-01T00:00:00Z" }], observedBalanceCount: 2 };
  const empty = { connections: [], observedBalanceCount: 0 };

  it("calls the Journal step Activity for an individual", () => {
    const step = gettingStartedStep("journal", empty, "individual");
    expect(step).toMatchObject({ label: "Activity", cta: "Open Activity", href: "/dashboard/ledger" });
    expect(step.title).toBe("Post entries deliberately");
    expect(step.body).toContain("Use Activity");
    expect(step.body).not.toMatch(/journal/i);
  });

  it("leaves the organization's Journal step as it was", () => {
    const step = gettingStartedStep("journal", empty);
    expect(step).toMatchObject({ label: "Journal", cta: "Open Journal", title: "Post journals deliberately" });
    expect(gettingStartedStep("journal", empty, "organization")).toEqual(step);
  });

  it("uses no Journal or hidden-section wording on any step for an individual", () => {
    for (const progress of [empty, checked]) {
      for (const phase of gettingStartedPhases("individual")) {
        const step = gettingStartedStep(phase, progress, "individual");
        const text = [step.label, step.title, step.body, step.cta].join(" ");
        expect(text).not.toMatch(/journal/i);
        expect(hiddenSectionsIn(text)).toEqual([]);
      }
    }
  });

  it("still mentions the journal for an organization's Holdings step", () => {
    expect(gettingStartedStep("holdings", checked).body).toContain("the journal");
    expect(gettingStartedStep("holdings", checked, "individual").body).toContain("your Activity entries");
  });
});
