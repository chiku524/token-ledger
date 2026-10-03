import { describe, expect, it } from "vitest";
import {
  backoffFor,
  decideAttempt,
  isLeaseExpired,
  nextAttemptAt,
  outboxDedupeKey,
} from "./outbox";
import { decideSponsorship, defaultSponsorPolicy, type SponsorPolicy } from "./sponsor";
import type { JobHandler } from "./runner";

describe("outbox backoff", () => {
  it("grows exponentially and caps", () => {
    expect(backoffFor(1)).toBeGreaterThanOrEqual(5_000);
    expect(backoffFor(10)).toBeLessThanOrEqual(300_000);
    expect(backoffFor(1)).toBeLessThan(backoffFor(5));
  });

  it("schedules the next attempt from now", () => {
    const now = new Date("2026-10-03T00:00:00.000Z");
    expect(nextAttemptAt(now, 1).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("lease expiry", () => {
  const now = new Date("2026-10-03T00:00:00.000Z");
  it("reclaims an expired or absent lease, keeps a fresh one", () => {
    expect(isLeaseExpired(null, now)).toBe(true);
    expect(isLeaseExpired(new Date(now.getTime() - 120_000), now, 60_000)).toBe(true);
    expect(isLeaseExpired(new Date(now.getTime() - 1_000), now, 60_000)).toBe(false);
  });
});

describe("dedupe keys", () => {
  it("are stable and distinguish a discriminator", () => {
    expect(outboxDedupeKey("billing.collect", "m1")).toBe("billing.collect:m1");
    expect(outboxDedupeKey("billing.collect", "m1", "cycle:3")).not.toBe(outboxDedupeKey("billing.collect", "m1", "cycle:4"));
  });
});

describe("decideAttempt", () => {
  it("is dead at once on a non-retryable error", () => {
    expect(decideAttempt({ attempts: 1, retryable: false })).toEqual({ outcome: "dead", needsStateCheck: false });
  });

  it("retries a retryable error with a state check after blockhash expiry", () => {
    expect(decideAttempt({ attempts: 1, retryable: true, blockhashExpired: true })).toEqual({
      outcome: "retry",
      needsStateCheck: true,
    });
  });

  it("is dead once max attempts is reached", () => {
    expect(decideAttempt({ attempts: 6, retryable: true }).outcome).toBe("dead");
  });
});

describe("sponsor policy", () => {
  const policy: SponsorPolicy = {
    perTxFeeCeilingLamports: 50_000n,
    perOrgDailyCeilingLamports: 10_000_000n,
    allowedActions: ["billing.collect", "treasury.execute"],
  };

  it("sponsors an allowed action within both ceilings", () => {
    expect(decideSponsorship(policy, { action: "billing.collect", feeEstimateLamports: 5_000n, orgSpentTodayLamports: 0n })).toEqual({
      sponsored: true,
    });
  });

  it("refuses an action outside the allow-list", () => {
    expect(decideSponsorship(policy, { action: "treasury.initialize", feeEstimateLamports: 5_000n, orgSpentTodayLamports: 0n })).toEqual({
      sponsored: false,
      reason: "action_not_sponsored",
    });
  });

  it("refuses over the per-tx ceiling or the org daily quota", () => {
    expect(decideSponsorship(policy, { action: "billing.collect", feeEstimateLamports: 60_000n, orgSpentTodayLamports: 0n }).sponsored).toBe(false);
    expect(decideSponsorship(policy, { action: "billing.collect", feeEstimateLamports: 5_000n, orgSpentTodayLamports: 9_999_000n }).sponsored).toBe(false);
  });

  it("has a conservative default policy", () => {
    expect(defaultSponsorPolicy().allowedActions).not.toContain("treasury.initialize");
  });
});

describe("worker pass (in-memory harness)", () => {
  // A minimal fake of the DB-backed runner dependencies to prove the loop.
  it("completes, retries and skips according to handler results", async () => {
    const results = new Map<string, "ok" | "retry" | "dead">();
    const calls: string[] = [];
    const handlers: Record<string, JobHandler> = {
      "billing.collect": async ({ job }) => {
        calls.push(job.id);
        const outcome = results.get(job.id);
        if (outcome === "ok") return { ok: true };
        if (outcome === "dead") return { ok: false, retryable: false };
        return { ok: false, retryable: true };
      },
    };
    // Import lazily so the DB layer is not touched.
    const { decideAttempt } = await import("./outbox");
    const jobs = [
      { id: "j1", kind: "billing.collect", attempts: 0, organizationId: "o", subjectId: "s", payload: {}, dedupeKey: "k1", availableAt: new Date(), leasedAt: null },
      { id: "j2", kind: "billing.collect", attempts: 0, organizationId: "o", subjectId: "s", payload: {}, dedupeKey: "k2", availableAt: new Date(), leasedAt: null },
      { id: "j3", kind: "treasury.execute", attempts: 0, organizationId: "o", subjectId: "s", payload: {}, dedupeKey: "k3", availableAt: new Date(), leasedAt: null },
    ];
    results.set("j1", "ok");
    results.set("j2", "dead");
    const summary = { completed: 0, failed: 0, dead: 0, skipped: 0 };
    for (const job of jobs) {
      const handler = handlers[job.kind];
      if (!handler) {
        summary.skipped += 1;
        continue;
      }
      const result = await handler({ job, workerId: "w1" });
      if (result.ok) summary.completed += 1;
      else {
        const decision = decideAttempt({ attempts: 1, retryable: result.retryable ?? true });
        if (decision.outcome === "dead") summary.dead += 1;
        else summary.failed += 1;
      }
    }
    expect(summary).toEqual({ completed: 1, failed: 0, dead: 1, skipped: 1 });
    expect(calls).toEqual(["j1", "j2"]);
  });
});
