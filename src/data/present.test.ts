import { describe, expect, it } from "vitest";
import { formatUsdc } from "./present";

describe("formatUsdc", () => {
  it("shows USDC with two decimals", () => {
    expect(formatUsdc(0n)).toBe("USDC 0.00");
    expect(formatUsdc(500_000_000n)).toBe("USDC 500.00");
    expect(formatUsdc(1_230_000n)).toBe("USDC 1.23");
  });
});
