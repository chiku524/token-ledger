import { describe, expect, it } from "vitest";
import { SOL_DECIMALS, toMinorUnits } from "./amounts";

describe("toMinorUnits", () => {
  it("passes through a raw integer amount unchanged", () => {
    expect(toMinorUnits(1_000_000_000n)).toBe(1_000_000_000n);
    expect(toMinorUnits("23000004000000")).toBe(23_000_004_000_000n);
    expect(toMinorUnits(2039280)).toBe(2_039_280n);
  });

  it("keeps exactness for amounts beyond the safe integer range", () => {
    const huge = "18446744073709551615";
    expect(toMinorUnits(huge)).toBe(18446744073709551615n);
  });

  it("rejects unsafe, fractional, negative, and malformed amounts", () => {
    expect(() => toMinorUnits(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer/i);
    expect(() => toMinorUnits(1.5)).toThrow(/integer/i);
    expect(() => toMinorUnits(-1)).toThrow(/negative/i);
    expect(() => toMinorUnits(-1n)).toThrow(/negative/i);
    expect(() => toMinorUnits("1.5")).toThrow(/non-negative integer/i);
    expect(() => toMinorUnits("")).toThrow(/non-negative integer/i);
  });

  it("documents the SOL scale", () => {
    expect(SOL_DECIMALS).toBe(9);
  });
});
