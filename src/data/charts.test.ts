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

const ENT = "ent_asset_manager_a";

describe("dashboard chart rows", () => {
  it("formats example carrying amounts in the functional currency", () => {
    const assets = assetAllocationPanels();
    expect(assets.map((panel) => panel.currency)).toEqual(["USD"]);
    expect(assets[0]?.rows.map((row) => [row.label, row.value, row.formatted])).toEqual([
      ["BUIDL", 2012500, "USD 2,012,500.00 · 47.2%"],
      ["USDC", 1499550, "USD 1,499,550.00 · 35.2%"],
      ["XAU", 750000, "USD 750,000.00 · 17.6%"],
    ]);
    expect(reportAssetBars(ENT)).toEqual(assets[0]?.rows);
  });

  it("plots source, kind, and chain totals from the same books", () => {
    expect(sourceCarryingPanels()[0]?.rows.map((row) => [row.label, row.value])).toEqual([
      ["BlackRock digital wallet (Ethereum)", 1512500],
      ["Circle wallet", 1499550],
      ["DBS digital wallet (private EVM)", 750000],
      ["BlackRock digital wallet (Solana)", 500000],
    ]);
    expect(sourceKindPanels()[0]?.rows.map((row) => row.label)).toEqual(["Wallet"]);
    expect(chainPanels().map((panel) => [panel.currency, panel.rows[0]?.label, panel.rows[0]?.value])).toEqual([
      ["USD", "Ethereum", 3512050],
    ]);
  });

  it("draws the carrying-value path and the asset mix", () => {
    const [assetManagerA] = carryingSeries();
    expect(assetManagerA?.points.map((point) => point.value)).toEqual([
      0, 2000000, 3500000, 4250000, 4250000, 4262500, 4262050,
    ]);
    expect(assetManagerA?.points.at(-1)?.formatted).toBe("USD 4,262,050.00");
    expect(compositionPanels()[0]?.rows.map((row) => [row.label, row.value])).toEqual([
      ["Cash", 750000],
      ["Crypto", 750000],
      ["Stablecoins", 3512050],
    ]);
  });

  it("counts journals and reconciliation status", () => {
    const activity = journalActivityChart();
    expect(activity.rows.map((row) => [row.label, row[ENT]])).toEqual([
      ["Apr", 2],
      ["May", 2],
      ["Jun", 3],
    ]);
    expect(reconciliationStatus()).toMatchObject({
      total: 8,
      rows: [
        { id: "matched", value: 7 },
        { id: "exception", value: 1 },
      ],
    });
    expect(reconciliationBySource()[0]).toMatchObject({ label: "DBS digital wallet (Hyperledger)", matched: 0, exception: 1 });
  });
});
