import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLDINGS_DISPLAY_CURRENCY,
  HOLDINGS_DISPLAY_CURRENCIES,
  resolveHoldingsDisplayCurrency,
} from "./display-currency";

describe("resolveHoldingsDisplayCurrency", () => {
  it("accepts USD, SGD, and MYR (case-insensitive)", () => {
    expect(resolveHoldingsDisplayCurrency("usd")).toBe("USD");
    expect(resolveHoldingsDisplayCurrency("SGD")).toBe("SGD");
    expect(resolveHoldingsDisplayCurrency("myr")).toBe("MYR");
  });

  it("falls back for missing or unsupported codes (including SGP)", () => {
    expect(resolveHoldingsDisplayCurrency(undefined)).toBe(DEFAULT_HOLDINGS_DISPLAY_CURRENCY);
    expect(resolveHoldingsDisplayCurrency("SGP")).toBe("USD");
    expect(resolveHoldingsDisplayCurrency("EUR")).toBe("USD");
  });

  it("lists the three display currencies in toggle order", () => {
    expect([...HOLDINGS_DISPLAY_CURRENCIES]).toEqual(["USD", "SGD", "MYR"]);
  });
});
