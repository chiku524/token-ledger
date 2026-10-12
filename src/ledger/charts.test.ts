import { describe, expect, it } from "vitest";
import { exampleBooks } from "@/data/example-books";
import {
  assetAccountNets,
  carryingByAsset,
  carryingByAssetClass,
  carryingByChain,
  carryingBySource,
  carryingBySourceKind,
  carryingValueSeries,
  journalActivityByMonth,
  percentOf,
  reconciliationCounts,
} from "./charts";
import { toMinor } from "./money";
import { trialBalance } from "./reports";

const ENT = "ent_asset_manager_a";
const sen = (amount: string) => toMinor(amount, 2);

describe("percentOf", () => {
  it("rounds half up to one decimal and handles an empty total", () => {
    expect(percentOf(sen("31624.00"), sen("73624.00"))).toBe("43.0%");
    expect(percentOf(sen("42000.00"), sen("73624.00"))).toBe("57.0%");
    expect(percentOf(0n, 0n)).toBe("0.0%");
  });
});

describe("example book charts", () => {
  const { journalEntries: entries, accounts, sources, assets, reconciliations } = exampleBooks;
  const sourceMeta = sources.map((source) => ({ id: source.id, kind: source.kind }));

  it("allocates carrying value by asset in one functional currency", () => {
    const rows = carryingByAsset(entries, accounts);
    expect(rows.filter((row) => row.entityId === ENT).map((row) => [row.assetCode, row.carryingMinor])).toEqual([
      ["BUIDL", sen("2012500.00")],
      ["USDC", sen("1499550.00")],
      ["XAU", sen("750000.00")],
    ]);
    expect(new Set(rows.map((row) => row.currency))).toEqual(new Set(["USD"]));
  });

  it("attributes carrying value to the source that holds it", () => {
    const rows = carryingBySource(entries, accounts, sourceMeta);
    const amount = (sourceId: string) => rows.find((row) => row.sourceId === sourceId)?.carryingMinor;
    expect(amount("src_buidl_eth")).toBe(sen("1512500.00"));
    expect(amount("src_buidl_sol")).toBe(sen("500000.00"));
    expect(amount("src_usdc_circle")).toBe(sen("1499550.00"));
    expect(amount("src_gold_evm")).toBe(sen("750000.00"));
    expect(amount("src_gold_hl")).toBeUndefined();
    expect(amount("src_bny_custody")).toBeUndefined();

    const sourceTotal = sum(rows.filter((row) => row.entityId === ENT));
    const assetTotal = sum(carryingByAsset(entries, accounts).filter((row) => row.entityId === ENT));
    expect(sourceTotal).toBe(assetTotal);
  });

  it("groups sources by kind and assets by chain inside one currency", () => {
    const kinds = carryingBySourceKind(entries, accounts, sourceMeta).filter((row) => row.currency === "USD");
    expect(kinds.map((row) => [row.kind, row.carryingMinor])).toEqual([["wallet", sen("4262050.00")]]);

    expect(carryingByChain(entries, accounts, assets).map((row) => [row.chain, row.currency, row.carryingMinor])).toEqual([
      ["ethereum", "USD", sen("3512050.00")],
      ["dbs-private-evm", "USD", sen("750000.00")],
    ]);
  });

  it("groups carrying value by asset class and keeps unknown assets visible", () => {
    const classRows = carryingByAssetClass(entries, accounts, assets).filter((row) => row.entityId === ENT);
    expect(classRows.map((row) => [row.assetClass, row.currency, row.carryingMinor])).toEqual([
      ["stablecoin", "USD", sen("3512050.00")],
      ["crypto", "USD", sen("750000.00")],
    ]);

    const unknown = carryingByAssetClass(entries, accounts, [{ code: "XAU", assetClass: "crypto" }]).filter(
      (row) => row.entityId === ENT,
    );
    expect(unknown.map((row) => [row.assetClass, row.carryingMinor])).toEqual([
      ["unspecified", sen("3512050.00")],
      ["crypto", sen("750000.00")],
    ]);
  });

  it("tracks carrying value after each example journal date", () => {
    const series = carryingValueSeries(entries, accounts);
    const rows = series.filter((point) => point.entityId === ENT).map((point) => [point.date, point.carryingMinor]);
    expect(rows).toEqual([
      ["2026-04-02", 0n],
      ["2026-04-08", sen("2000000.00")],
      ["2026-05-05", sen("3500000.00")],
      ["2026-05-20", sen("4250000.00")],
      ["2026-06-01", sen("4250000.00")],
      ["2026-06-15", sen("4262500.00")],
      ["2026-06-20", sen("4262050.00")],
    ]);
    expect(rows.at(-1)?.[1]).toBe(sen("4262050.00"));
  });

  it("nets asset accounts and counts journals and reconciliation results", () => {
    const accountNets = assetAccountNets(trialBalance(entries, accounts, ENT));
    expect(accountNets.map((row) => [row.code, row.netMinor])).toEqual([
      ["1000", sen("750000.00")],
      ["1310", sen("750000.00")],
      ["1330", sen("3512050.00")],
    ]);

    expect(journalActivityByMonth(entries).map((row) => [row.month, row.entityId, row.count, row.debitMinor])).toEqual([
      ["2026-04", ENT, 2, sen("7000000.00")],
      ["2026-05", ENT, 2, sen("2250000.00")],
      ["2026-06", ENT, 3, sen("512950.00")],
    ]);

    const counts = reconciliationCounts(reconciliations);
    expect(counts.matched).toBe(7);
    expect(counts.exception).toBe(1);
    expect(counts.bySource[0]).toEqual({ sourceId: "src_gold_hl", matched: 0, exception: 1 });
  });
});

function sum(rows: readonly { carryingMinor: bigint }[]): bigint {
  return rows.reduce((total, row) => total + row.carryingMinor, 0n);
}
