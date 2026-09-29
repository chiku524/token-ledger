import { describe, expect, it } from "vitest";
import {
  assetAllocationPanels,
  carryingSeries,
  chainPanels,
  compositionPanels,
  journalActivityChart,
  reconciliationBySource,
  reconciliationStatus,
  reportAssetBars,
  sourceCarryingPanels,
  sourceKindPanels,
} from "./charts";

describe("dashboard chart rows", () => {
  it("formats example carrying amounts and keeps currencies apart", () => {
    const assets = assetAllocationPanels();
    expect(assets.map((panel) => panel.currency)).toEqual(["MYR", "SGD"]);
    expect(assets[0]?.rows.map((row) => [row.label, row.value, row.formatted])).toEqual([
      ["USDC · IFRS 9", 42000, "MYR 42,000.00 · 57.0%"],
      ["ETH · IAS 38", 31624, "MYR 31,624.00 · 43.0%"],
    ]);
    expect(assets[1]?.rows).toEqual([
      expect.objectContaining({ label: "SOL · IAS 38", value: 18000, formatted: "SGD 18,000.00 · 100.0%" }),
    ]);
    expect(reportAssetBars("ent_harbourline_sg")).toEqual(assets[1]?.rows);
  });

  it("plots source, kind, and chain totals from the same books", () => {
    expect(sourceCarryingPanels()[0]?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Northwharf Custody", 42000],
      ["Treasury cold wallet", 24774],
      ["Example Exchange — KL desk", 6200],
      ["ETH staking position", 650],
    ]);
    expect(sourceKindPanels()[0]?.rows.map((row) => row.label)).toEqual(["Custodian", "Wallet", "Exchange"]);
    expect(chainPanels().map((panel) => [panel.currency, panel.rows[0]?.label, panel.rows[0]?.value])).toEqual([
      ["MYR", "Ethereum", 73624],
      ["SGD", "Solana", 18000],
    ]);
  });

  it("draws the carrying-value path and the asset mix", () => {
    const [malaysia, singapore] = carryingSeries();
    expect(malaysia?.points.map((point) => point.value)).toEqual([0, 0, 31000, 31000, 31000, 31650, 31624, 73624]);
    expect(malaysia?.points.at(-1)?.formatted).toBe("MYR 73,624.00");
    expect(singapore?.points.at(-1)).toMatchObject({ value: 18000, formatted: "SGD 18,000.00" });
    expect(compositionPanels()[0]?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Cash", 427000],
      ["Intangible assets", 31624],
      ["Stablecoins", 42000],
    ]);
  });

  it("counts journals and reconciliation status", () => {
    const activity = journalActivityChart();
    expect(activity.rows.map((row) => [row.label, row.ent_harbourline_my, row.ent_harbourline_sg])).toEqual([
      ["Apr", 3, 2],
      ["May", 2, 0],
      ["Jun", 1, 0],
    ]);
    expect(reconciliationStatus()).toMatchObject({
      total: 8,
      rows: [
        { id: "matched", value: 7 },
        { id: "exception", value: 1 },
      ],
    });
    expect(reconciliationBySource()[0]).toMatchObject({ label: "Treasury hot wallet", matched: 0, exception: 1 });
  });
});
