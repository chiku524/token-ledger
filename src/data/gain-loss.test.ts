import { describe, expect, it } from "vitest";
import { postJournalEntry, toMinor, type JournalEntryInput, type JournalLineInput } from "@/ledger";
import type { Books, StoredAssetPrice, StoredFxRate } from "./books";
import { exampleBooks } from "./example-books";
import {
  computeGainLoss,
  costBasisInputs,
  directionOf,
  gainLossBarRows,
  gainLossCopy,
  gainLossLinePoints,
  holdingsGainLoss,
  moneyText,
  notIncludedText,
  percentOf,
  signedMoney,
  signedPercent,
  trackedInputs,
} from "./gain-loss";
import { bannedTermsIn } from "@/test/banned-terms";

const ENT = exampleBooks.entities[0].id;
const usd = (amount: string) => toMinor(amount, 2);

/** Whole units: the test asset has no decimals, so quantity is a plain count. */
const ASSETS = [
  { ...exampleBooks.assets[0], code: "ABC", decimals: 0 },
  { ...exampleBooks.assets[0], code: "XYZ", decimals: 0 },
];

function entry(
  id: string,
  entryDate: string,
  lines: JournalLineInput[],
) {
  const input: JournalEntryInput = { id, entityId: ENT, reference: id, entryDate, memo: id, lines };
  return { ...postJournalEntry(input), postedBy: "test", postedAt: `${entryDate}T00:00:00.000Z`, reversesEntryId: null };
}

function buy(id: string, day: string, assetCode: string, quantity: number, amount: string, currency = "USD") {
  return entry(id, day, [
    { accountCode: "1330", side: "debit", amountMinor: usd(amount), currency, assetCode, quantityMinor: BigInt(quantity), quantityDirection: "in", sourceId: "src_buidl_eth" },
    { accountCode: "1000", side: "credit", amountMinor: usd(amount), currency },
  ]);
}

function sell(id: string, day: string, assetCode: string, quantity: number, amount: string) {
  return entry(id, day, [
    { accountCode: "1000", side: "debit", amountMinor: usd(amount), currency: "USD" },
    { accountCode: "1330", side: "credit", amountMinor: usd(amount), currency: "USD", assetCode, quantityMinor: BigInt(quantity), quantityDirection: "out", sourceId: "src_buidl_eth" },
  ]);
}

function price(assetCode: string, quoteCurrency: string, amount: string, asOf: string): StoredAssetPrice {
  return {
    id: `p_${assetCode}_${quoteCurrency}_${asOf}`,
    organizationId: exampleBooks.organization.id,
    assetCode,
    quoteCurrency,
    priceMinor: usd(amount),
    quoteScale: 2,
    asOf: `${asOf}T03:00:00.000Z`,
    origin: "live",
    source: "test",
  };
}

function rate(base: string, quote: string, numerator: bigint, asOf: string): StoredFxRate {
  return { id: `fx_${base}_${quote}_${asOf}`, organizationId: exampleBooks.organization.id, baseCurrency: base, quoteCurrency: quote, numerator, scale: 4, asOf, origin: "live", note: "test" };
}

function books(over: Partial<Books>): Books {
  return { ...exampleBooks, assets: ASSETS, journalEntries: [], balanceSnapshots: [], assetPrices: [], fxRates: [], ...over } as Books;
}

const NOW = new Date("2026-01-31T12:00:00.000Z");

describe("average cost from the books", () => {
  it("averages two buys and values at the latest price", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("b", "2026-01-10", "ABC", 10, "200.00")],
      assetPrices: [price("ABC", "USD", "20.00", "2026-01-31")],
    });
    const result = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW });
    expect(result.basis).toBe("cost");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ assetCode: "ABC", quantityMinor: 20n, valueMinor: usd("400.00"), investedMinor: usd("300.00"), gainMinor: usd("100.00"), percent: 33.33, stale: false });
    expect(result.totals).toMatchObject({ valueMinor: usd("400.00"), investedMinor: usd("300.00"), gainMinor: usd("100.00"), percent: 33.33 });
    expect(result.notIncluded).toEqual([]);
  });

  it("removes average cost on a sale, so only what is still held is compared", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("b", "2026-01-10", "ABC", 10, "200.00"), sell("c", "2026-01-20", "ABC", 5, "120.00")],
      assetPrices: [price("ABC", "USD", "20.00", "2026-01-31")],
    });
    const [row] = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW }).rows;
    expect(row).toMatchObject({ quantityMinor: 15n, investedMinor: usd("225.00"), valueMinor: usd("300.00"), gainMinor: usd("75.00") });
  });

  it("shows a loss as a negative number", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00")],
      assetPrices: [price("ABC", "USD", "4.00", "2026-01-31")],
    });
    const { totals, rows } = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW });
    expect(totals.gainMinor).toBe(usd("-60.00"));
    expect(totals.percent).toBe(-60);
    expect(directionOf(rows[0].gainMinor)).toBe("loss");
  });

  it("treats a move between wallets as no change in cost", () => {
    const move = entry("m", "2026-01-15", [
      { accountCode: "1330", side: "debit", amountMinor: usd("50.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "in", sourceId: "src_buidl_sol" },
      { accountCode: "1330", side: "credit", amountMinor: usd("50.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "out", sourceId: "src_buidl_eth" },
    ]);
    const { events } = costBasisInputs(books({ journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00"), move] }), "USD");
    expect(events).toHaveLength(1);
  });

  it("leaves out an asset when more leaves than ever came in", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 5, "50.00"), sell("c", "2026-01-20", "ABC", 9, "120.00"), buy("d", "2026-01-22", "XYZ", 1, "10.00")],
      assetPrices: [price("ABC", "USD", "20.00", "2026-01-31"), price("XYZ", "USD", "12.00", "2026-01-31")],
    });
    const result = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW });
    expect(result.rows.map((row) => row.assetCode)).toEqual(["XYZ"]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "incomplete-history", quantityMinor: null }]);
  });

  it("leaves out an asset bought in a currency with no exchange rate", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00", "EUR")],
      assetPrices: [price("ABC", "USD", "20.00", "2026-01-31")],
    });
    const result = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-rate", quantityMinor: null }]);
  });

  it("converts cost at the rate on the day of each purchase", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("b", "2026-01-10", "ABC", 10, "100.00")],
      fxRates: [rate("USD", "MYR", 40000n, "2026-01-01"), rate("USD", "MYR", 50000n, "2026-01-05")],
      assetPrices: [price("ABC", "MYR", "10.00", "2026-01-31")],
    });
    const [row] = holdingsGainLoss(b, { individual: false, currency: "MYR", now: NOW }).rows;
    // 100 USD at 4.00 = 400 MYR, then 100 USD at 5.00 = 500 MYR.
    expect(row.investedMinor).toBe(usd("900.00"));
    expect(row.valueMinor).toBe(usd("200.00"));
    expect(row.gainMinor).toBe(usd("-700.00"));
  });

  it("works in SGD too", () => {
    const b = books({
      journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00")],
      fxRates: [rate("USD", "SGD", 13500n, "2026-01-01")],
      assetPrices: [price("ABC", "SGD", "20.00", "2026-01-31")],
    });
    const [row] = holdingsGainLoss(b, { individual: false, currency: "SGD", now: NOW }).rows;
    expect(row.investedMinor).toBe(usd("135.00"));
    expect(row.gainMinor).toBe(usd("65.00"));
  });

  it("lists on-chain balance with no recorded cost as not included", () => {
    const result = holdingsGainLoss(exampleBooks, { individual: false, currency: "USD", now: new Date("2026-06-30T12:00:00.000Z") });
    const codes = result.rows.map((row) => row.assetCode);
    expect(codes).toEqual(["BUIDL", "USDC", "XAU"]);
    expect(result.notIncluded).toHaveLength(1);
    expect(result.notIncluded[0]).toMatchObject({ assetCode: "XAU", reason: "no-cost", quantityMinor: 5n * 10n ** 18n });
    // The 5 unbooked units are not in the 312.5 that has a cost.
    const gold = result.rows.find((row) => row.assetCode === "XAU");
    expect(gold?.quantityMinor).toBe(3125n * 10n ** 17n);
    expect(gold?.gainMinor).toBe(0n);
    expect(result.totals.investedMinor).toBe(usd("2012500.00") + usd("1499550.00") + usd("750000.00"));
  });

  it("does not guess an asset with no price", () => {
    const b = books({ journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00")] });
    const result = holdingsGainLoss(b, { individual: false, currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-price", quantityMinor: 10n }]);
    expect(result.totals.valueMinor).toBe(0n);
    expect(result.series).toEqual([]);
  });

  it("returns an empty result with no activity", () => {
    const result = holdingsGainLoss(books({}), { individual: false, currency: "USD", now: NOW });
    expect(result).toMatchObject({ rows: [], notIncluded: [], series: [], skippedDays: 0, stale: false });
    expect(result.totals).toEqual({ valueMinor: 0n, investedMinor: 0n, gainMinor: 0n, percent: null });
  });
});

describe("the line over time", () => {
  const journalEntries = [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("b", "2026-01-10", "ABC", 10, "200.00")];

  it("draws one point per day with a fresh price and counts the days it had to skip", () => {
    const assetPrices = [price("ABC", "USD", "12.00", "2026-01-02"), price("ABC", "USD", "15.00", "2026-01-10"), price("ABC", "USD", "20.00", "2026-01-31")];
    const result = holdingsGainLoss(books({ journalEntries, assetPrices }), { individual: false, currency: "USD", now: NOW });
    const days = result.series.map((point) => point.day);
    // 01-01 has no price yet. 01-02 and 01-10 are priced; 01-31 is priced today.
    expect(days).toEqual(["2026-01-02", "2026-01-10", "2026-01-31"]);
    expect(result.skippedDays).toBe(1);
    expect(result.series[0]).toMatchObject({ valueMinor: usd("120.00"), investedMinor: usd("100.00"), gainMinor: usd("20.00") });
    expect(result.series[1]).toMatchObject({ valueMinor: usd("300.00"), investedMinor: usd("300.00"), gainMinor: 0n });
    expect(result.series[2].gainMinor).toBe(usd("100.00"));
  });

  it("does not stretch an old price across days that have none", () => {
    const assetPrices = [price("ABC", "USD", "12.00", "2026-01-02")];
    const result = holdingsGainLoss(books({ journalEntries, assetPrices }), { individual: false, currency: "USD", now: NOW });
    // The only price is four weeks old: it is the headline price (flagged old) but cannot draw a line.
    expect(result.rows[0].stale).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.series.map((point) => point.day)).toEqual(["2026-01-02"]);
  });

  it("shapes points and bars for the charts with words as well as signs", () => {
    const assetPrices = [price("ABC", "USD", "12.00", "2026-01-02"), price("ABC", "USD", "20.00", "2026-01-31")];
    const result = holdingsGainLoss(books({ journalEntries, assetPrices }), { individual: false, currency: "USD", now: NOW });
    const points = gainLossLinePoints(result);
    expect(points[0]).toMatchObject({ label: "2026-01-02", axisLabel: "2 Jan", value: 120, invested: 100, gain: 20, valueText: "USD 120.00", gainText: "Gain +USD 20.00" });
    const [bar] = gainLossBarRows(result);
    expect(bar).toMatchObject({ id: "ABC", value: 100, formatted: "Gain +USD 100.00 (+33.33%)" });
  });
});

describe("tracked gain / loss for an individual", () => {
  const snap = (id: string, assetCode: string, quantity: number, asOf: string, sourceId = "src_a") => ({
    id,
    organizationId: exampleBooks.organization.id,
    entityId: ENT,
    sourceId,
    assetCode,
    quantityMinor: BigInt(quantity),
    asOf: `${asOf}T08:00:00.000Z`,
  });

  it("counts each balance change at that day's price", () => {
    const b = books({
      balanceSnapshots: [snap("s1", "ABC", 10, "2026-01-02"), snap("s2", "ABC", 15, "2026-01-12")],
      assetPrices: [price("ABC", "USD", "10.00", "2026-01-02"), price("ABC", "USD", "12.00", "2026-01-12"), price("ABC", "USD", "14.00", "2026-01-31")],
    });
    const result = holdingsGainLoss(b, { individual: true, currency: "USD", now: NOW });
    expect(result.basis).toBe("tracked");
    // 10 at 10.00 = 100, then 5 more at 12.00 = 60. Now 15 at 14.00 = 210.
    expect(result.rows[0]).toMatchObject({ investedMinor: usd("160.00"), valueMinor: usd("210.00"), gainMinor: usd("50.00"), percent: 31.25 });
    expect(result.series.map((point) => point.day)).toEqual(["2026-01-02", "2026-01-12", "2026-01-31"]);
  });

  it("counts money taken out as a reduction in what was put in", () => {
    const b = books({
      balanceSnapshots: [snap("s1", "ABC", 10, "2026-01-02"), snap("s2", "ABC", 4, "2026-01-12")],
      assetPrices: [price("ABC", "USD", "10.00", "2026-01-02"), price("ABC", "USD", "20.00", "2026-01-12"), price("ABC", "USD", "20.00", "2026-01-31")],
    });
    const [row] = holdingsGainLoss(b, { individual: true, currency: "USD", now: NOW }).rows;
    // Put in 100, took out 6 at 20.00 = 120. Put in is -20; 4 left at 20.00 = 80.
    expect(row.investedMinor).toBe(usd("-20.00"));
    expect(row.gainMinor).toBe(usd("100.00"));
    expect(row.percent).toBeNull();
  });

  it("leaves out an asset with no price on the day its balance changed", () => {
    const b = books({
      balanceSnapshots: [snap("s1", "ABC", 10, "2026-01-02"), snap("s2", "XYZ", 3, "2026-01-02")],
      assetPrices: [price("XYZ", "USD", "5.00", "2026-01-02"), price("ABC", "USD", "10.00", "2026-01-30")],
    });
    const result = holdingsGainLoss(b, { individual: true, currency: "USD", now: NOW });
    expect(result.rows.map((row) => row.assetCode)).toEqual(["XYZ"]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-price", quantityMinor: 10n }]);
  });

  it("uses the example books without throwing", () => {
    const inputs = trackedInputs(exampleBooks, "SGD", new Date("2026-06-30T12:00:00.000Z"));
    expect(inputs.events.length).toBeGreaterThan(0);
  });
});

describe("computeGainLoss", () => {
  it("handles a fully sold asset by leaving it out", () => {
    const result = computeGainLoss({
      basis: "cost",
      events: [
        { assetCode: "ABC", day: "2026-01-01", quantityMinor: 10n, costMinor: usd("100.00") },
        { assetCode: "ABC", day: "2026-01-05", quantityMinor: -10n, costMinor: usd("-100.00") },
      ],
      assets: ASSETS,
      prices: [price("ABC", "USD", "20.00", "2026-01-31")],
      currency: "USD",
      now: NOW,
    });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([]);
  });
});

describe("display helpers and wording", () => {
  it("formats signed amounts and percents", () => {
    expect(signedMoney(usd("1234.5"), "USD")).toBe("+USD 1,234.50");
    expect(signedMoney(usd("-12"), "SGD")).toBe("-SGD 12.00");
    expect(signedMoney(0n, "MYR")).toBe("MYR 0.00");
    expect(moneyText(usd("-3"), "USD")).toBe("-USD 3.00");
    expect(signedPercent(12.5)).toBe("+12.50%");
    expect(signedPercent(-3)).toBe("-3.00%");
    expect(signedPercent(null)).toBe("n/a");
    expect(percentOf(10n, 0n)).toBeNull();
    expect(percentOf(-5n, 20n)).toBe(-25);
  });

  it("gives an individual plain words with no accounting terms", () => {
    const copy = gainLossCopy("tracked");
    const words = [...Object.values(copy), ...(["no-cost", "no-price", "no-rate", "incomplete-history"] as const).map((reason) => notIncludedText("tracked", reason))].join(" ");
    expect(bannedTermsIn(words)).toEqual([]);
    expect(copy.valueLabel).toBe("Value now");
    expect(copy.investedLabel).toBe("Put in");
    expect(copy.gainLabel).toBe("Gain / loss");
  });

  it("names the organization's unrealized gain apart from the profit and loss statement", () => {
    const copy = gainLossCopy("cost");
    expect(copy.title).not.toMatch(/profit/i);
    expect(notIncludedText("cost", "no-cost")).toBe("not included: no cost data");
  });
});