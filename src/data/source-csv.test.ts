import { describe, expect, it } from "vitest";
import { toMinor } from "@/ledger";
import { parseSourceTransactionCsv } from "./source-csv";

const assets = [
  { code: "ETH", decimals: 18 },
  { code: "USDC", decimals: 6 },
];

describe("parseSourceTransactionCsv", () => {
  it("parses a wallet export into minor units", () => {
    const parsed = parseSourceTransactionCsv(
      "external_id,occurred_on,asset_code,direction,quantity,description\nchain-1,2026-06-18,ETH,in,0.1,\"Hot wallet, example\"\n",
      assets,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      {
        externalId: "chain-1",
        occurredOn: "2026-06-18",
        assetCode: "ETH",
        direction: "in",
        quantityMinor: toMinor("0.1", 18),
        description: "Hot wallet, example",
      },
    ]);
  });

  it("rejects a bad header, unknown assets, duplicate ids, and blank files", () => {
    expect(parseSourceTransactionCsv("a,b\n1,2\n", assets).ok).toBe(false);
    const unknown = parseSourceTransactionCsv(
      "external_id,occurred_on,asset_code,direction,quantity,description\nrow,2026-06-18,BTC,in,1,Nope\n",
      assets,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.errors[0]).toContain("unknown asset");
    const duplicate = parseSourceTransactionCsv(
      "external_id,occurred_on,asset_code,direction,quantity,description\nsame,2026-06-18,ETH,in,1,One\nsame,2026-06-19,ETH,out,1,Two\n",
      assets,
    );
    expect(duplicate.ok).toBe(false);
    expect(parseSourceTransactionCsv("", assets).ok).toBe(false);
  });
});
