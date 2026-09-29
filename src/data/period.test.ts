import { describe, expect, it } from "vitest";
import { parseDateRange, rangesOverlap, withinRange } from "./period";

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

  it("matches journal dates inside the range and overlapping reconciliation periods", () => {
    expect(withinRange("2026-04-01", fallback)).toBe(true);
    expect(withinRange("2026-03-31", fallback)).toBe(false);
    expect(rangesOverlap({ start: "2026-01-01", end: "2026-04-01" }, fallback)).toBe(true);
    expect(rangesOverlap({ start: "2026-07-01", end: "2026-09-30" }, fallback)).toBe(false);
  });
});