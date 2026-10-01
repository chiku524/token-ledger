import { describe, expect, it } from "vitest";
import {
  backoffForFailures,
  consecutiveFailureCount,
  DEFAULT_SYNC_INTERVAL_MS,
  isConnectionDue,
  isDue,
  nextDueAt,
  SYNC_BACKOFF_MS,
} from "./sync-schedule";

describe("backoffForFailures", () => {
  it("does not wait before the first failure", () => {
    expect(backoffForFailures(0)).toBe(0);
  });

  it("steps up with each consecutive failure and settles at the ceiling", () => {
    expect(backoffForFailures(1)).toBe(SYNC_BACKOFF_MS[1]);
    expect(backoffForFailures(2)).toBe(SYNC_BACKOFF_MS[2]);
    expect(backoffForFailures(99)).toBe(SYNC_BACKOFF_MS[SYNC_BACKOFF_MS.length - 1]);
  });
});

describe("isDue", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("is due when it has never run", () => {
    expect(isDue(null, 0, now)).toBe(true);
  });

  it("is due once the interval has passed", () => {
    const ranJustNow = new Date(now.getTime() - 1000);
    const ranLongAgo = new Date(now.getTime() - DEFAULT_SYNC_INTERVAL_MS - 1);
    expect(isDue(ranJustNow, 0, now)).toBe(false);
    expect(isDue(ranLongAgo, 0, now)).toBe(true);
  });

  it("waits longer after failures", () => {
    const recent = new Date(now.getTime() - DEFAULT_SYNC_INTERVAL_MS - 1);
    expect(isDue(recent, 0, now)).toBe(true);
    expect(isDue(recent, 1, now)).toBe(false);
  });
});

describe("nextDueAt", () => {
  it("adds the interval and any backoff", () => {
    const last = new Date("2026-06-01T12:00:00Z");
    expect(nextDueAt(last, 0)?.toISOString()).toBe(new Date(last.getTime() + DEFAULT_SYNC_INTERVAL_MS).toISOString());
    expect(nextDueAt(last, 1)?.toISOString()).toBe(
      new Date(last.getTime() + DEFAULT_SYNC_INTERVAL_MS + SYNC_BACKOFF_MS[1]).toISOString(),
    );
    expect(nextDueAt(null, 0)).toBeNull();
  });
});

describe("isConnectionDue", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("honours a stored backoff time", () => {
    expect(isConnectionDue({ lastSyncedAt: null, nextAttemptAt: "2026-06-01T12:30:00Z" }, now)).toBe(false);
    expect(isConnectionDue({ lastSyncedAt: null, nextAttemptAt: "2026-06-01T11:30:00Z" }, now)).toBe(true);
  });

  it("falls back to the interval when there is no backoff", () => {
    expect(isConnectionDue({ lastSyncedAt: null, nextAttemptAt: null }, now)).toBe(true);
    expect(isConnectionDue({ lastSyncedAt: "2026-06-01T11:30:00Z", nextAttemptAt: null }, now)).toBe(true);
    expect(isConnectionDue({ lastSyncedAt: "2026-06-01T11:59:00Z", nextAttemptAt: null }, now)).toBe(false);
  });
});

describe("consecutiveFailureCount", () => {
  it("counts the failed head and stops at the first success", () => {
    expect(consecutiveFailureCount([{ status: "failed" }, { status: "not_live" }, { status: "ok" }])).toBe(2);
    expect(consecutiveFailureCount([{ status: "ok" }, { status: "failed" }])).toBe(0);
    expect(consecutiveFailureCount([])).toBe(0);
  });
});
