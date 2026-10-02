import { describe, expect, it } from "vitest";
import type { AssetPrice } from "./pricing";
import { proposeRevaluation } from "./revaluation";

function price(assetCode: string, priceMinor: bigint, asOf: string): AssetPrice {
  return { id: `p_${assetCode}`, organizationId: "org_1", assetCode, quoteCurrency: "USD", priceMinor, quoteScale: 2, asOf, origin: "live", source: "coingecko" };
}

const AS_OF = "2026-06-15T00:00:00Z";

describe("proposeRevaluation", () => {
  it("posts a gain when market value exceeds carrying value", () => {
    const proposal = proposeRevaluation({
      prices: [price("ETH", 320000n, "2026-06-14T00:00:00Z")],
      holdings: [{ assetCode: "ETH", quantityMinor: 1_000000000000000000n, quantityScale: 18, carryingMinor: 250000n }],
      quoteCurrency: "USD",
      assetAccountCode: "1300",
      gainAccountCode: "4200",
      lossAccountCode: "5200",
      asOf: AS_OF,
    });
    // 1 ETH at 3200.00 = 320000; carrying 250000; gain 70000.
    expect(proposal.netMinor).toBe(70000n);
    expect(proposal.journalLines).toEqual([
      { accountCode: "1300", side: "debit", amountMinor: 70000n, currency: "USD" },
      { accountCode: "4200", side: "credit", amountMinor: 70000n, currency: "USD" },
    ]);
  });

  it("posts a loss when market value is below carrying value", () => {
    const proposal = proposeRevaluation({
      prices: [price("ETH", 200000n, "2026-06-14T00:00:00Z")],
      holdings: [{ assetCode: "ETH", quantityMinor: 1_000000000000000000n, quantityScale: 18, carryingMinor: 250000n }],
      quoteCurrency: "USD",
      assetAccountCode: "1300",
      gainAccountCode: "4200",
      lossAccountCode: "5200",
      asOf: AS_OF,
    });
    expect(proposal.netMinor).toBe(-50000n);
    expect(proposal.journalLines).toEqual([
      { accountCode: "5200", side: "debit", amountMinor: 50000n, currency: "USD" },
      { accountCode: "1300", side: "credit", amountMinor: 50000n, currency: "USD" },
    ]);
  });

  it("returns no entry when nothing moved, and reports unpriced assets", () => {
    const proposal = proposeRevaluation({
      prices: [price("ETH", 250000n, "2026-06-14T00:00:00Z")],
      holdings: [
        { assetCode: "ETH", quantityMinor: 1_000000000000000000n, quantityScale: 18, carryingMinor: 250000n },
        { assetCode: "SOL", quantityMinor: 1_000000000n, quantityScale: 9, carryingMinor: 10000n },
      ],
      quoteCurrency: "USD",
      assetAccountCode: "1300",
      gainAccountCode: "4200",
      lossAccountCode: "5200",
      asOf: AS_OF,
    });
    expect(proposal.journalLines).toEqual([]);
    expect(proposal.netMinor).toBe(0n);
    expect(proposal.unpriced).toEqual(["SOL"]);
  });

  it("flags stale prices so the entry is provisional", () => {
    const proposal = proposeRevaluation({
      prices: [price("ETH", 400000n, "2026-06-01T00:00:00Z")],
      holdings: [{ assetCode: "ETH", quantityMinor: 1_000000000000000000n, quantityScale: 18, carryingMinor: 250000n }],
      quoteCurrency: "USD",
      assetAccountCode: "1300",
      gainAccountCode: "4200",
      lossAccountCode: "5200",
      asOf: AS_OF,
    });
    expect(proposal.staleAssetCodes).toEqual(["ETH"]);
    expect(proposal.netMinor).toBe(150000n);
  });
});
