import { describe, expect, it } from "vitest";
import { toMinor } from "./money";
import { exampleAccounts, exampleBooks, exampleFxRates, exampleJournalEntries } from "@/data/example-books";
import { consolidateTrialBalances, formatFxRate, formatInverseRate, selectFxRate, translateMinor, translateMinorInverse } from "./fx";
import { netBalanceMinor } from "./reports";

describe("FX translation", () => {
  it("converts minor units with half-up rounding and never uses a float rate", () => {
    const rate = { numerator: 3000n, scale: 4 };
    expect(translateMinor(toMinor("100.00", 2), rate, 2, 2)).toBe(toMinor("30.00", 2));
    expect(translateMinor(toMinor("31624.00", 2), rate, 2, 2)).toBe(toMinor("9487.20", 2));
    expect(translateMinor(1n, { numerator: 5000n, scale: 4 }, 2, 2)).toBe(1n);
    expect(translateMinor(1n, rate, 2, 2)).toBe(0n);
    expect(translateMinor(toMinor("-10.00", 2), rate, 2, 2)).toBe(toMinor("-3.00", 2));
  });

  it("picks the latest rate on or before the reporting date and prefers a live rate that day", () => {
    const rates = [
      { ...exampleFxRates[0], id: "old", asOf: "2026-04-01", origin: "example" as const },
      { ...exampleFxRates[0], id: "later", asOf: "2026-05-01", origin: "example" as const, numerator: 3100n },
      { ...exampleFxRates[0], id: "live", asOf: "2026-05-01", origin: "live" as const, numerator: 3200n },
      { ...exampleFxRates[0], id: "future", asOf: "2026-07-01", origin: "live" as const, numerator: 9999n },
    ];
    expect(selectFxRate(rates, "MYR", "SGD", "2026-06-30")?.id).toBe("live");
    expect(selectFxRate(rates, "MYR", "SGD", "2026-04-15")?.id).toBe("old");
    expect(selectFxRate(rates, "EUR", "SGD", "2026-06-30")).toBeNull();
  });

  it("labels example rates and consolidates Harbourline into SGD without mixing the currencies raw", () => {
    expect(formatFxRate(exampleFxRates[0])).toBe("1 MYR = 0.3000 SGD");
    expect(exampleFxRates[0]?.note.toLowerCase()).toContain("example");

    const group = consolidateTrialBalances({
      entities: exampleBooks.entities,
      entries: exampleJournalEntries,
      accounts: exampleAccounts,
      rates: exampleFxRates,
      presentationCurrency: "SGD",
      asOf: "2026-06-30",
    });

    expect(group.entities.every((entity) => entity.included)).toBe(true);
    expect(group.debitTotal).toBe(group.creditTotal);
    const cash = group.rows.find((row) => row.code === "1000");
    expect(cash && cash.debitMinor - cash.creditMinor).toBe(toMinor("190100.00", 2));
    expect(group.rows.some((row) => row.code === "FX-ROUND")).toBe(false);
  });

  it("leaves an entity out when no rate exists, and keeps SGD unchanged in a MYR presentation", () => {
    const missing = consolidateTrialBalances({
      entities: exampleBooks.entities,
      entries: exampleJournalEntries,
      accounts: exampleAccounts,
      rates: [],
      presentationCurrency: "SGD",
      asOf: "2026-06-30",
    });
    expect(missing.entities.find((entity) => entity.functionalCurrency === "MYR")?.included).toBe(false);
    expect(missing.entities.find((entity) => entity.functionalCurrency === "SGD")?.included).toBe(true);

    const myr = consolidateTrialBalances({
      entities: exampleBooks.entities,
      entries: exampleJournalEntries,
      accounts: exampleAccounts,
      rates: exampleFxRates,
      presentationCurrency: "MYR",
      asOf: "2026-06-30",
    });
    const sol = myr.rows.find((row) => row.code === "1310");
    const sgIntangible = netBalanceMinor({
      debitMinor: toMinor("18000.00", 2),
      creditMinor: 0n,
      normalBalance: "debit",
    });
    const myrRate = exampleFxRates[0];
    if (!myrRate) throw new Error("missing example rate");
    expect(formatInverseRate(myrRate)).toBe("1 SGD = 10/3 MYR");
    expect(translateMinorInverse(translateMinor(toMinor("100.00", 2), myrRate, 2, 2), myrRate, 2, 2)).toBe(toMinor("100.00", 2));
    expect(myr.entities.find((entity) => entity.functionalCurrency === "SGD")?.rateLabel).toContain("exact inverse");
    expect(sol && sol.debitMinor - sol.creditMinor).toBe(toMinor("31624.00", 2) + translateMinorInverse(sgIntangible, myrRate, 2, 2));
  });
});
