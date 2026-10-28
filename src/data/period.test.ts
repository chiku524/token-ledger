import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_DAYS,
  defaultActivityRange,
  latestActivityDay,
  parseDateRange,
  rangesOverlap,
  shiftDay,
  withinRange,
} from "./period";

describe("date ranges", () => {
  const fallback = { from: "2026-04-01", to: "2026-06-30" };

  it("fills missing dates from the books period and rejects an inverted range", () => {
    expect(parseDateRange({}, fallback)).toEqual({ ok: true, range: fallback });
    expect(parseDateRange({ from: "2026-05-01" }, fallback)).toEqual({
      ok: true,
      range: { from: "2026-05-01", to: "2026-06-30" },
    });
    expect(parseDateRange({ from: "2026-07-01", to: "2026-06-01" }, fallback).ok).toBe(false);
    expect(parseDateRange({ from: "2026-02-31" }, fallback).ok).toBe(false);
  });

  describe("the default range for an individual", () => {
    const now = new Date("2026-10-28T15:00:00Z");
    const empty = { sourceTransactions: [], balanceSnapshots: [], assetPrices: [] };

    it("moves a day across month and year ends", () => {
      expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
      expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
      expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
      expect(shiftDay("2026-10-28", 0)).toBe("2026-10-28");
    });

    it("ends on the newest day any transaction, balance reading or price was seen", () => {
      expect(latestActivityDay(empty, now)).toBeNull();
      expect(
        latestActivityDay(
          {
            sourceTransactions: [{ occurredOn: "2026-09-02" }],
            balanceSnapshots: [{ asOf: "2026-10-10T08:00:00.000Z" }],
            assetPrices: [{ asOf: "2026-10-12T00:00:00.000Z" }],
          },
          now,
        ),
      ).toBe("2026-10-12");
      expect(latestActivityDay({ ...empty, sourceTransactions: [{ occurredOn: "2026-10-20" }] }, now)).toBe("2026-10-20");
    });

    it("ignores days after today, so a stray future date cannot push the range out", () => {
      expect(
        latestActivityDay({ ...empty, balanceSnapshots: [{ asOf: "2026-10-27T10:00:00Z" }, { asOf: "2027-01-01T00:00:00Z" }] }, now),
      ).toBe("2026-10-27");
      expect(defaultActivityRange({ ...empty, sourceTransactions: [{ occurredOn: "2030-01-01" }] }, now).to).toBe("2026-10-28");
    });

    it("is the 30 days ending on the latest activity, not January 1 to today", () => {
      const range = defaultActivityRange({ ...empty, balanceSnapshots: [{ asOf: "2026-10-12T09:30:00Z" }] }, now);
      expect(range).toEqual({ from: "2026-09-13", to: "2026-10-12" });
      expect(DEFAULT_ACTIVITY_DAYS).toBe(30);
      const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
      expect(days).toBe(30);
    });

    it("falls back to the 30 days ending today when nothing has been seen", () => {
      expect(defaultActivityRange(empty, now)).toEqual({ from: "2026-09-29", to: "2026-10-28" });
    });

    it("lets a range from the address win, and fills only what it leaves out", () => {
      const fallback = defaultActivityRange({ ...empty, balanceSnapshots: [{ asOf: "2026-10-12T00:00:00Z" }] }, now);
      expect(parseDateRange({ from: "2026-01-01", to: "2026-10-28" }, fallback)).toEqual({
        ok: true,
        range: { from: "2026-01-01", to: "2026-10-28" },
      });
      expect(parseDateRange({ from: "2026-10-01" }, fallback)).toEqual({
        ok: true,
        range: { from: "2026-10-01", to: "2026-10-12" },
      });
      expect(parseDateRange({}, fallback)).toEqual({ ok: true, range: fallback });
    });
  });

  it("matches journal dates inside the range and overlapping reconciliation periods", () => {
    expect(withinRange("2026-04-01", fallback)).toBe(true);
    expect(withinRange("2026-03-31", fallback)).toBe(false);
    expect(rangesOverlap({ start: "2026-01-01", end: "2026-04-01" }, fallback)).toBe(true);
    expect(rangesOverlap({ start: "2026-07-01", end: "2026-09-30" }, fallback)).toBe(false);
  });
});