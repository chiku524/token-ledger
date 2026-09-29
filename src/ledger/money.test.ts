import { describe, expect, it } from "vitest";
import { formatMinor, minorToNumber, toMinor } from "./money";

describe("toMinor", () => {
  it("parses fiat and crypto scales without floating point", () => {
    expect(toMinor("500000.00", 2)).toBe(50_000_000n);
    expect(toMinor("2.5", 18)).toBe(2_500_000_000_000_000_000n);
    expect(toMinor("2.50", 18)).toBe(toMinor("2.5", 18));
    expect(toMinor("0.002", 18)).toBe(2_000_000_000_000_000n);
    expect(toMinor("10000", 6)).toBe(10_000_000_000n);
    expect(toMinor("-1.50", 2)).toBe(-150n);
  });

  it("rejects values that are not exact minor units", () => {
    expect(() => toMinor("1.234", 2)).toThrow(/decimal places/);
    expect(() => toMinor("1e2", 2)).toThrow(/Invalid decimal/);
    expect(() => toMinor("", 2)).toThrow(/Invalid decimal/);
  });
});

describe("formatMinor", () => {
  it("groups whole units and keeps exact fractions", () => {
    expect(formatMinor(50_000_000n, 2, { minFraction: 2, maxFraction: 2 })).toBe("500,000.00");
    expect(formatMinor(toMinor("2.5", 18), 18, { minFraction: 0, maxFraction: 8 })).toBe("2.5");
    expect(formatMinor(toMinor("0.002", 18), 18, { minFraction: 0, maxFraction: 8 })).toBe("0.002");
    expect(formatMinor(0n, 2, { minFraction: 2, maxFraction: 2 })).toBe("0.00");
  });

  it("converts fiat minor units to an exact chart number", () => {
    expect(minorToNumber(3_162_400n, 2)).toBe(31624);
    expect(minorToNumber(-150n, 2)).toBe(-1.5);
    expect(minorToNumber(0n, 2)).toBe(0);
    expect(() => minorToNumber((BigInt(Number.MAX_SAFE_INTEGER) + 1n) * 100n, 2)).toThrow(/too large/);
  });

  it("does not hide a non-zero remainder when maxFraction is short", () => {
    const wei = 1n;
    expect(formatMinor(wei, 18, { maxFraction: 8 })).toBe(`0.${"0".repeat(17)}1`);
  });
});
