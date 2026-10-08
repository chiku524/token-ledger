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

const MY = "ent_harbourline_my";
const SG = "ent_harbourline_sg";
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

  it("allocates carrying value by asset without mixing MYR and SGD", () => {
    const rows = carryingByAsset(entries, accounts);
    expect(rows.filter((row) => row.entityId === MY).map((row) => [row.assetCode, row.carryingMinor])).toEqual([
      ["USDC", sen("42000.00")],
      ["ETH", sen("31624.00")],
    ]);
    expect(rows.filter((row) => row.entityId === SG)).toEqual([
      expect.objectContaining({ assetCode: "SOL", currency: "SGD", carryingMinor: sen("18000.00") }),
    ]);
    expect(new Set(rows.map((row) => row.currency))).toEqual(new Set(["MYR", "SGD"]));
  });

  it("attributes carrying value to the source that holds it", () => {
    const rows = carryingBySource(entries, accounts, sourceMeta);
    const amount = (sourceId: string) => rows.find((row) => row.sourceId === sourceId)?.carryingMinor;
    expect(amount("src_my_exchange")).toBe(sen("6200.00"));
    expect(amount("src_my_cold")).toBe(sen("24774.00"));
    expect(amount("src_my_stake")).toBe(sen("650.00"));
    expect(amount("src_my_custody")).toBe(sen("42000.00"));
    expect(amount("src_my_hot")).toBeUndefined();
    expect(amount("src_sg_custody")).toBe(sen("18000.00"));

    const mySources = sum(rows.filter((row) => row.entityId === MY));
    const myAssets = sum(carryingByAsset(entries, accounts).filter((row) => row.entityId === MY));
    expect(mySources).toBe(myAssets);
  });

  it("groups sources by kind and assets by chain inside one currency", () => {
    const kinds = carryingBySourceKind(entries, accounts, sourceMeta).filter((row) => row.currency === "MYR");
    expect(kinds.map((row) => [row.kind, row.carryingMinor])).toEqual([
      ["custodian", sen("42000.00")],
      ["wallet", sen("25424.00")],
      ["exchange", sen("6200.00")],
    ]);

    expect(carryingByChain(entries, accounts, assets).map((row) => [row.chain, row.currency, row.carryingMinor])).toEqual([
      ["ethereum", "MYR", sen("73624.00")],
      ["solana", "SGD", sen("18000.00")],
    ]);
  });

  it("groups carrying value by asset class and keeps unknown assets visible", () => {
    const classRows = carryingByAssetClass(entries, accounts, assets).filter((row) => row.entityId === MY);
    expect(classRows.map((row) => [row.assetClass, row.currency, row.carryingMinor])).toEqual([
      ["stablecoin", "MYR", sen("42000.00")],
      ["crypto", "MYR", sen("31624.00")],
    ]);

    const unknown = carryingByAssetClass(entries, accounts, [{ code: "ETH", assetClass: "crypto" }]).filter(
      (row) => row.entityId === MY,
    );
    expect(unknown.map((row) => [row.assetClass, row.carryingMinor])).toEqual([
      ["unspecified", sen("42000.00")],
      ["crypto", sen("31624.00")],
    ]);
  });

  it("tracks carrying value after each example journal date", () => {
    const series = carryingValueSeries(entries, accounts);
    const my = series.filter((point) => point.entityId === MY).map((point) => [point.date, point.carryingMinor]);
    expect(my).toEqual([
      ["2026-04-02", 0n],
      ["2026-04-06", 0n],
      ["2026-04-08", sen("31000.00")],
      ["2026-04-09", sen("31000.00")],
      ["2026-04-15", sen("31000.00")],
      ["2026-05-01", sen("31650.00")],
      ["2026-05-12", sen("31624.00")],
      ["2026-06-03", sen("73624.00")],
    ]);
    const sg = series.filter((point) => point.entityId === SG);
    expect(sg[0]).toMatchObject({ date: "2026-04-02", carryingMinor: 0n, currency: "SGD" });
    expect(sg.at(-1)?.carryingMinor).toBe(sen("18000.00"));
  });

  it("nets asset accounts and counts journals and reconciliation results", () => {
    const myAssets = assetAccountNets(trialBalance(entries, accounts, MY));
    expect(myAssets.map((row) => [row.code, row.netMinor])).toEqual([
      ["1000", sen("427000.00")],
      ["1310", sen("31624.00")],
      ["1330", sen("42000.00")],
    ]);

    expect(journalActivityByMonth(entries).map((row) => [row.month, row.entityId, row.count, row.debitMinor])).toEqual([
      ["2026-04", MY, 3, sen("555800.00")],
      ["2026-04", SG, 2, sen("98000.00")],
      ["2026-05", MY, 2, sen("676.00")],
      ["2026-06", MY, 1, sen("42000.00")],
    ]);

    const counts = reconciliationCounts(reconciliations);
    expect(counts.matched).toBe(7);
    expect(counts.exception).toBe(1);
    expect(counts.bySource[0]).toEqual({ sourceId: "src_my_hot", matched: 0, exception: 1 });
  });
});

function sum(rows: readonly { carryingMinor: bigint }[]): bigint {
  return rows.reduce((total, row) => total + row.carryingMinor, 0n);
}
