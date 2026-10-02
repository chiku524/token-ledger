import { describe, expect, it } from "vitest";
import { isLocked, lockedMessage, lockCovering, type PeriodLock } from "./period-locks";

const locks: PeriodLock[] = [
  { id: "l1", entityId: "e1", periodStart: "2026-04-01", periodEnd: "2026-06-30", note: "Q2" },
  { id: "l2", entityId: "e2", periodStart: "2026-04-01", periodEnd: "2026-06-30", note: "Q2" },
];

describe("period locks", () => {
  it("covers a date inside the range and is open outside it", () => {
    expect(isLocked(locks, "e1", "2026-05-15")).toBe(true);
    expect(isLocked(locks, "e1", "2026-04-01")).toBe(true);
    expect(isLocked(locks, "e1", "2026-06-30")).toBe(true);
    expect(isLocked(locks, "e1", "2026-07-01")).toBe(false);
    expect(isLocked(locks, "e1", "2026-03-31")).toBe(false);
  });

  it("scopes the lock to the entity", () => {
    expect(isLocked(locks, "e3", "2026-05-15")).toBe(false);
    expect(lockCovering(locks, "e2", "2026-05-15")?.id).toBe("l2");
  });

  it("names the closed range in the message", () => {
    const lock = lockCovering(locks, "e1", "2026-05-15");
    if (!lock) throw new Error("expected a lock");
    expect(lockedMessage(lock, "2026-05-15")).toContain("2026-04-01 to 2026-06-30");
  });
});
