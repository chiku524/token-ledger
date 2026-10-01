import { describe, expect, it } from "vitest";
import { isValidEvmAddress, normalizeEvmAddress } from "./address";
import { hexToMinorUnits, isZeroAmount } from "./amounts";

const CHECKS = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("isValidEvmAddress", () => {
  it("accepts a checksummed 20-byte address in any case", () => {
    expect(isValidEvmAddress(CHECKS)).toBe(true);
    expect(isValidEvmAddress(CHECKS.toLowerCase())).toBe(true);
  });

  it("rejects wrong length, missing prefix, and non-hex", () => {
    expect(isValidEvmAddress("0x123")).toBe(false);
    expect(isValidEvmAddress(CHECKS.slice(2))).toBe(false);
    expect(isValidEvmAddress("0xzz00000000000000000000000000000000000000")).toBe(false);
    expect(isValidEvmAddress(undefined)).toBe(false);
    expect(isValidEvmAddress(42)).toBe(false);
  });

  it("normalizes to lowercase and rejects bad input", () => {
    expect(normalizeEvmAddress(CHECKS)).toBe(CHECKS.toLowerCase());
    expect(() => normalizeEvmAddress("nope")).toThrow(/not a valid EVM address/);
  });
});

describe("hexToMinorUnits", () => {
  it("decodes wei and token hex amounts exactly", () => {
    expect(hexToMinorUnits("0xde0b6b3a7640000")).toBe(1_000_000_000_000_000_000n);
    expect(hexToMinorUnits("0x0000000000000000000000000000000000000000000000000000000c1889e580")).toBe(
      51_951_297_920n,
    );
    expect(hexToMinorUnits("0x0")).toBe(0n);
  });

  it("also accepts a decimal string", () => {
    expect(hexToMinorUnits("42")).toBe(42n);
  });

  it("rejects empty, negative, and malformed values", () => {
    expect(() => hexToMinorUnits("")).toThrow(/empty/i);
    expect(() => hexToMinorUnits("-0x1")).toThrow(/negative/i);
    expect(() => hexToMinorUnits("0xzz")).toThrow(/hex or decimal/i);
  });

  it("recognizes zero", () => {
    expect(isZeroAmount("0x0")).toBe(true);
    expect(isZeroAmount("0x1")).toBe(false);
  });
});
