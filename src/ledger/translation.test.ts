import { describe, expect, it } from "vitest";
import type { FxRate } from "./fx";
import type { LedgerAccount, PostedJournalEntry } from "./types";
import { translateGroupIas21 } from "./translation";

const accounts: LedgerAccount[] = [
  { entityId: "e1", code: "1000", name: "Cash", type: "asset", normalBalance: "debit", measurementBasis: null },
  { entityId: "e1", code: "4100", name: "Income", type: "income", normalBalance: "credit", measurementBasis: null },
  { entityId: "e1", code: "3100", name: "Capital", type: "equity", normalBalance: "credit", measurementBasis: null },
];

const entries: PostedJournalEntry[] = [
  {
    id: "je_1",
    entityId: "e1",
    reference: "OPEN",
    entryDate: "2026-04-01",
    memo: "",
    currency: "MYR",
    debitMinor: 100000n,
    creditMinor: 100000n,
    lines: [
      { lineNumber: 1, accountCode: "1000", side: "debit", amountMinor: 100000n, currency: "MYR" },
      { lineNumber: 2, accountCode: "3100", side: "credit", amountMinor: 100000n, currency: "MYR" },
    ],
  },
  {
    id: "je_2",
    entityId: "e1",
    reference: "INC",
    entryDate: "2026-06-30",
    memo: "",
    currency: "MYR",
    debitMinor: 20000n,
    creditMinor: 20000n,
    lines: [
      { lineNumber: 1, accountCode: "1000", side: "debit", amountMinor: 20000n, currency: "MYR" },
      { lineNumber: 2, accountCode: "4100", side: "credit", amountMinor: 20000n, currency: "MYR" },
    ],
  },
];

const rates: FxRate[] = [
  { id: "r_open", baseCurrency: "MYR", quoteCurrency: "SGD", numerator: 300000n, scale: 6, asOf: "2026-04-01", origin: "live", note: "" },
  { id: "r_close", baseCurrency: "MYR", quoteCurrency: "SGD", numerator: 310000n, scale: 6, asOf: "2026-06-30", origin: "live", note: "" },
];

describe("translateGroupIas21", () => {
  it("translates the balance sheet at closing and the P&L at average, with a reserve", () => {
    const result = translateGroupIas21({
      entities: [{ id: "e1", name: "MY", functionalCurrency: "MYR", parentEntityId: null }],
      entries,
      accounts,
      rates,
      periodStart: "2026-04-01",
      closingDate: "2026-06-30",
      presentationCurrency: "SGD",
    });
    // Cash 120000 MYR at closing 0.31 = 37200; capital 100000 at closing = 31000;
    // income 20000 at average 0.30 = 6000. Debits 37200, credits 37000, reserve 200.
    expect(result.debitTotal).toBe(result.creditTotal);
    const reserve = result.rows.find((row) => row.code === "3200");
    expect(reserve).toBeDefined();
    expect(result.reserveMinor).toBe(200n);
    expect(result.entities[0]?.included).toBe(true);
  });

  it("leaves an entity out and explains when a rate is missing", () => {
    // A rate dated between the period start and the close cannot serve as the
    // average rate at period start, so the entity is left out.
    const midPeriod: FxRate = { id: "r_mid", baseCurrency: "MYR", quoteCurrency: "SGD", numerator: 305000n, scale: 6, asOf: "2026-05-01", origin: "live", note: "" };
    const result = translateGroupIas21({
      entities: [{ id: "e1", name: "MY", functionalCurrency: "MYR", parentEntityId: null }],
      entries,
      accounts,
      rates: [midPeriod],
      periodStart: "2026-04-01",
      closingDate: "2026-06-30",
      presentationCurrency: "SGD",
    });
    expect(result.entities[0]?.included).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("includes an entity already in the presentation currency with no reserve", () => {
    const result = translateGroupIas21({
      entities: [{ id: "e1", name: "SG", functionalCurrency: "SGD", parentEntityId: null }],
      entries,
      accounts,
      rates: [],
      periodStart: "2026-04-01",
      closingDate: "2026-06-30",
      presentationCurrency: "SGD",
    });
    expect(result.entities[0]?.included).toBe(true);
    expect(result.reserveMinor).toBe(0n);
    expect(result.debitTotal).toBe(result.creditTotal);
  });
});
