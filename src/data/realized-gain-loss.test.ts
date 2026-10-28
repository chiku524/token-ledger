import { describe, expect, it } from "vitest";
import { postJournalEntry, toMinor, type JournalEntryInput, type JournalLineInput } from "@/ledger";
import type { Books, StoredFxRate } from "./books";
import { exampleBooks } from "./example-books";
import { holdingsGainLoss } from "./gain-loss";
import { holdingsRealizedGainLoss, REALIZED_COPY, realizedNotIncludedText } from "./realized-gain-loss";

const ENT = exampleBooks.entities[0].id;
const usd = (amount: string) => toMinor(amount, 2);
const NOW = new Date("2026-01-31T12:00:00.000Z");

const ASSETS = [
  { ...exampleBooks.assets[0], code: "ABC", decimals: 0 },
  { ...exampleBooks.assets[0], code: "XYZ", decimals: 0 },
];

function entry(id: string, entryDate: string, lines: JournalLineInput[]) {
  const input: JournalEntryInput = { id, entityId: ENT, reference: id, entryDate, memo: id, lines };
  return { ...postJournalEntry(input), postedBy: "test", postedAt: `${entryDate}T00:00:00.000Z`, reversesEntryId: null };
}

function buy(id: string, day: string, assetCode: string, quantity: number, amount: string) {
  return entry(id, day, [
    { accountCode: "1330", side: "debit", amountMinor: usd(amount), currency: "USD", assetCode, quantityMinor: BigInt(quantity), quantityDirection: "in", sourceId: "src_buidl_eth" },
    { accountCode: "1000", side: "credit", amountMinor: usd(amount), currency: "USD" },
  ]);
}

/** A sale for cash: cash in (the proceeds), the asset out at the same booked amount. */
function sellForCash(id: string, day: string, assetCode: string, quantity: number, proceeds: string, currency = "USD") {
  return entry(id, day, [
    { accountCode: "1000", side: "debit", amountMinor: usd(proceeds), currency },
    { accountCode: "1330", side: "credit", amountMinor: usd(proceeds), currency, assetCode, quantityMinor: BigInt(quantity), quantityDirection: "out", sourceId: "src_buidl_eth" },
  ]);
}

function rate(base: string, quote: string, numerator: bigint, asOf: string): StoredFxRate {
  return { id: `fx_${base}_${quote}_${asOf}`, organizationId: exampleBooks.organization.id, baseCurrency: base, quoteCurrency: quote, numerator, scale: 4, asOf, origin: "live", note: "test" };
}

function books(over: Partial<Books>): Books {
  return { ...exampleBooks, assets: ASSETS, journalEntries: [], balanceSnapshots: [], assetPrices: [], fxRates: [], ...over } as Books;
}

const BUYS = [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("b", "2026-01-10", "ABC", 10, "200.00")];

describe("realized gain / loss from sales in the books", () => {
  it("is proceeds minus the average cost of the units sold", () => {
    // Average cost is 300 / 20 = 15 per unit. 5 units sold for 120: cost 75, gain 45.
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "120.00")] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([
      { assetCode: "ABC", sales: 1, quantityMinor: 5n, proceedsMinor: usd("120.00"), costMinor: usd("75.00"), gainMinor: usd("45.00"), percent: 60 },
    ]);
    expect(result.totals).toEqual({ proceedsMinor: usd("120.00"), costMinor: usd("75.00"), gainMinor: usd("45.00"), percent: 60 });
    expect(result.salesCounted).toBe(1);
    expect(result.notIncluded).toEqual([]);
  });

  it("shows a loss as a negative number", () => {
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 10, "100.00")] }), { currency: "USD", now: NOW });
    expect(result.totals.gainMinor).toBe(usd("-50.00"));
    expect(result.totals.percent).toBe(-33.33);
  });

  it("needs no market price, and leaves the unrealized figures as they were", () => {
    const withSale = books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "120.00")] });
    expect(withSale.assetPrices).toEqual([]);
    expect(holdingsRealizedGainLoss(withSale, { currency: "USD", now: NOW }).totals.gainMinor).toBe(usd("45.00"));
    // The unrealized side still removes the same average cost: 15 units left at 15 each.
    const unrealized = holdingsGainLoss({ ...withSale, assetPrices: [{ id: "p", organizationId: "o", assetCode: "ABC", quoteCurrency: "USD", priceMinor: usd("20.00"), quoteScale: 2, asOf: "2026-01-31T03:00:00.000Z", origin: "live", source: "test" }] } as Books, { individual: false, currency: "USD", now: NOW });
    expect(unrealized.rows[0]).toMatchObject({ investedMinor: usd("225.00"), gainMinor: usd("75.00") });
  });

  it("adds several sales of one asset using the running average", () => {
    const result = holdingsRealizedGainLoss(
      books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "120.00"), sellForCash("d", "2026-01-25", "ABC", 5, "60.00")] }),
      { currency: "USD", now: NOW },
    );
    // The second sale also removes 15 per unit (the average does not move on a sale): cost 75 + 75, proceeds 180.
    expect(result.rows[0]).toMatchObject({ sales: 2, quantityMinor: 10n, proceedsMinor: usd("180.00"), costMinor: usd("150.00"), gainMinor: usd("30.00") });
  });

  it("counts a swap: the asset coming in is what the sale brought in", () => {
    const swap = entry("s", "2026-01-20", [
      { accountCode: "1330", side: "debit", amountMinor: usd("110.00"), currency: "USD", assetCode: "XYZ", quantityMinor: 11n, quantityDirection: "in", sourceId: "src_buidl_sol" },
      { accountCode: "1330", side: "credit", amountMinor: usd("110.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "out", sourceId: "src_buidl_eth" },
    ]);
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, swap] }), { currency: "USD", now: NOW });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ assetCode: "ABC", proceedsMinor: usd("110.00"), costMinor: usd("75.00"), gainMinor: usd("35.00") });
  });

  it("does not count a move between wallets as a sale", () => {
    const move = entry("m", "2026-01-15", [
      { accountCode: "1330", side: "debit", amountMinor: usd("50.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "in", sourceId: "src_buidl_sol" },
      { accountCode: "1330", side: "credit", amountMinor: usd("50.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "out", sourceId: "src_buidl_eth" },
    ]);
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, move] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([]);
  });

  it("converts the proceeds at the rate on the sale date, not a later one", () => {
    // Booked in MYR. 1 USD = 4.00 MYR on the sale date; it moves to 5.00 later.
    const rates = [rate("USD", "MYR", 40000n, "2026-01-15"), rate("USD", "MYR", 50000n, "2026-01-28")];
    const result = holdingsRealizedGainLoss(
      books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "480.00", "MYR")], fxRates: rates }),
      { currency: "USD", now: NOW },
    );
    expect(result.rows[0]).toMatchObject({ proceedsMinor: usd("120.00"), costMinor: usd("75.00"), gainMinor: usd("45.00") });
  });

  it("converts cost at the acquisition date and proceeds at the sale date, into the chosen currency", () => {
    // Report in MYR with the built-in 1 USD = 4.70 MYR: cost 75 USD = 352.50 MYR; proceeds 120 USD = 564.00 MYR.
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "120.00")] }), { currency: "MYR", now: NOW });
    expect(result.currency).toBe("MYR");
    expect(result.rows[0]).toMatchObject({ proceedsMinor: usd("564.00"), costMinor: usd("352.50"), gainMinor: usd("211.50") });
  });
});

describe("what is left out of realized gain / loss", () => {
  it("lists a sale with no proceeds in the entry, and never guesses", () => {
    const spend = entry("p", "2026-01-20", [
      { accountCode: "5100", side: "debit", amountMinor: usd("40.00"), currency: "USD" },
      { accountCode: "1330", side: "credit", amountMinor: usd("40.00"), currency: "USD", assetCode: "ABC", quantityMinor: 3n, quantityDirection: "out", sourceId: "src_buidl_eth" },
    ]);
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, spend] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.totals.gainMinor).toBe(0n);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-proceeds", sales: 1 }]);
    expect(realizedNotIncludedText("no-proceeds", 1)).toBe("not included: no sale proceeds recorded in the entry");
  });

  it("counts the sales left out for one reason together", () => {
    const spend = (id: string) =>
      entry(id, "2026-01-20", [
        { accountCode: "5100", side: "debit", amountMinor: usd("5.00"), currency: "USD" },
        { accountCode: "1330", side: "credit", amountMinor: usd("5.00"), currency: "USD", assetCode: "ABC", quantityMinor: 1n, quantityDirection: "out", sourceId: "src_buidl_eth" },
      ]);
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, spend("p1"), spend("p2")] }), { currency: "USD", now: NOW });
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-proceeds", sales: 2 }]);
    expect(realizedNotIncludedText("no-proceeds", 2)).toContain("(2 sales)");
  });

  it("lists a sale with no exchange rate for the sale date", () => {
    // Booked in EUR with no EUR rate saved or built in.
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, sellForCash("c", "2026-01-20", "ABC", 5, "100.00", "EUR")] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-sale-rate", sales: 1 }]);
  });

  it("lists a sale that gave up two assets at once, since the proceeds cannot be split", () => {
    const both = entry("t", "2026-01-20", [
      { accountCode: "1000", side: "debit", amountMinor: usd("300.00"), currency: "USD" },
      { accountCode: "1330", side: "credit", amountMinor: usd("100.00"), currency: "USD", assetCode: "ABC", quantityMinor: 5n, quantityDirection: "out", sourceId: "src_buidl_eth" },
      { accountCode: "1330", side: "credit", amountMinor: usd("200.00"), currency: "USD", assetCode: "XYZ", quantityMinor: 5n, quantityDirection: "out", sourceId: "src_buidl_eth" },
    ]);
    const result = holdingsRealizedGainLoss(books({ journalEntries: [buy("a", "2026-01-01", "ABC", 10, "100.00"), buy("x", "2026-01-02", "XYZ", 10, "100.00"), both] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded.map((item) => [item.assetCode, item.reason])).toEqual([
      ["ABC", "unclear-proceeds"],
      ["XYZ", "unclear-proceeds"],
    ]);
  });

  it("lists an asset whose cost cannot be followed, even if its sale had proceeds", () => {
    // 9 sold but only 5 ever bought: the unrealized side leaves it out too.
    const result = holdingsRealizedGainLoss(
      books({ journalEntries: [buy("a", "2026-01-01", "ABC", 5, "50.00"), sellForCash("c", "2026-01-20", "ABC", 9, "120.00"), buy("d", "2026-01-22", "XYZ", 1, "10.00"), sellForCash("e", "2026-01-25", "XYZ", 1, "15.00")] }),
      { currency: "USD", now: NOW },
    );
    expect(result.rows.map((row) => row.assetCode)).toEqual(["XYZ"]);
    expect(result.notIncluded).toEqual([{ assetCode: "ABC", reason: "no-cost-history", sales: 1 }]);
  });

  it("ignores a sale dated after today", () => {
    const result = holdingsRealizedGainLoss(books({ journalEntries: [...BUYS, sellForCash("c", "2026-02-20", "ABC", 5, "120.00")] }), { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.notIncluded).toEqual([]);
  });

  it("has nothing to report for the example books' wallet moves and fee payment, only a reason", () => {
    const result = holdingsRealizedGainLoss(exampleBooks as Books, { currency: "USD", now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.totals.gainMinor).toBe(0n);
  });
});

describe("wording", () => {
  it("says what it is and what it is not", () => {
    expect(REALIZED_COPY.description).toMatch(/average cost/i);
    expect(REALIZED_COPY.description).toMatch(/no lots/i);
    expect(REALIZED_COPY.description).toMatch(/not tax advice/i);
  });
});