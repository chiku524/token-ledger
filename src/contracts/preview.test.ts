import { describe, expect, it } from "vitest";
import { formatMinor, previewIsComplete, previewLine, type TransactionPreview } from "./preview";

function preview(overrides: Partial<TransactionPreview> = {}): TransactionPreview {
  return {
    action: "billing.collect",
    cluster: "devnet",
    programId: "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb",
    feePayer: "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp",
    amount: { minor: "20000000", decimals: 6, asset: "USDC" },
    recipientOwner: "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp",
    policyNote: "Collects one 30-day period at the signed price.",
    ...overrides,
  };
}

describe("formatMinor", () => {
  it("prints minor units exactly", () => {
    expect(formatMinor({ minor: "20000000", decimals: 6, asset: "USDC" })).toBe("20.000000");
    expect(formatMinor({ minor: "5", decimals: 6, asset: "USDC" })).toBe("0.000005");
    expect(formatMinor({ minor: "100", decimals: 0, asset: "X" })).toBe("100");
  });
});

describe("previewIsComplete", () => {
  it("accepts a complete money-moving preview", () => {
    expect(previewIsComplete(preview())).toEqual({ ok: true });
  });

  it("flags a missing amount or recipient on a payment", () => {
    const missingAmount = previewIsComplete(preview({ amount: undefined }));
    expect(missingAmount.ok).toBe(false);
    if (!missingAmount.ok) expect(missingAmount.missing).toContain("amount");

    const missingRecipient = previewIsComplete(preview({ recipientOwner: undefined }));
    expect(missingRecipient.ok).toBe(false);
    if (!missingRecipient.ok) expect(missingRecipient.missing).toContain("recipient");
  });

  it("does not require an amount for a revoke", () => {
    expect(previewIsComplete(preview({ action: "billing.revoke", amount: undefined, recipientOwner: undefined }))).toEqual({
      ok: true,
    });
  });
});

describe("previewLine", () => {
  it("summarizes action, amount, recipient and cluster", () => {
    const line = previewLine(preview());
    expect(line).toContain("billing.collect");
    expect(line).toContain("20.000000 USDC");
    expect(line).toContain("devnet");
  });
});
