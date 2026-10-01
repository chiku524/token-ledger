import { describe, expect, it } from "vitest";
import { splitKnownAssets } from "./sync-assets";

describe("splitKnownAssets", () => {
  const known = new Set(["ETH", "SOL"]);

  it("keeps known rows and reports unknown codes once", () => {
    const rows = [
      { assetCode: "ETH", n: 1 },
      { assetCode: "BTC", n: 2 },
      { assetCode: "SOL", n: 3 },
      { assetCode: "BTC", n: 4 },
    ];
    const { known: kept, skipped } = splitKnownAssets(rows, known);
    expect(kept.map((row) => row.n)).toEqual([1, 3]);
    expect(skipped).toEqual(["BTC"]);
  });

  it("keeps everything when all assets are known", () => {
    const { known: kept, skipped } = splitKnownAssets([{ assetCode: "ETH" }, { assetCode: "SOL" }], known);
    expect(kept).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  it("skips everything and reports the codes when none are known", () => {
    const { known: kept, skipped } = splitKnownAssets([{ assetCode: "BTC" }, { assetCode: "SUI" }], known);
    expect(kept).toEqual([]);
    expect(skipped).toEqual(["BTC", "SUI"]);
  });
});
