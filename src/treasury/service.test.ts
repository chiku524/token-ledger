import { describe, expect, it } from "vitest";
import type { SolanaDeployment } from "@/config/solana";
import { previewIsComplete } from "@/contracts/preview";
import {
  looksLikeDuplicate,
  newInvoiceKeyHex,
  normalizeReference,
  invoiceIdentityKey,
} from "./invoice";
import {
  planExecutePayment,
  planInitializeTreasury,
  planProposePayment,
  planTreasuryDeposit,
  treasuryAddresses,
  type TreasuryPlanContext,
} from "./service";

const deployment: SolanaDeployment = {
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  serviceBalanceProgram: "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb",
  treasuryPayablesProgram: "33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  merchantAdmin: null,
  merchantDestination: null,
};

const ctx: TreasuryPlanContext = {
  deployment,
  entity: "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp",
  actor: "HGkuzNQECFbbyKpANTufU1ppBBDaYnTCFaoVUYqrfFYR",
};

describe("normalizeReference", () => {
  it("collapses separators and case so a re-entry is caught", () => {
    expect(normalizeReference("INV-2026/0042")).toBe(normalizeReference("inv 2026 0042"));
    expect(normalizeReference("  a.b#c ")).toBe("ABC");
  });

  it("distinguishes different references and scopes duplicates by entity+supplier", () => {
    const a = { entityId: "e1", supplierId: "s1", reference: normalizeReference("INV-1") };
    const b = { entityId: "e1", supplierId: "s1", reference: normalizeReference("inv 1") };
    const c = { entityId: "e2", supplierId: "s1", reference: normalizeReference("INV-1") };
    expect(looksLikeDuplicate(a, b)).toBe(true);
    expect(looksLikeDuplicate(a, c)).toBe(false);
    expect(invoiceIdentityKey(a)).toBe("e1:s1:INV1");
  });

  it("mints a 32-byte hex invoice key", () => {
    expect(newInvoiceKeyHex()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("treasury plans", () => {
  it("derives the treasury family deterministically", async () => {
    expect(await treasuryAddresses(ctx)).toEqual(await treasuryAddresses(ctx));
  });

  it("builds a complete initialize preview", async () => {
    const plan = await planInitializeTreasury(ctx, {
      mint: deployment.usdcMint,
      tokenProgram: deployment.tokenProgram,
      threshold: 2,
      approvers: [ctx.actor, ctx.entity, deployment.usdcMint],
      proposers: [ctx.actor],
      perPaymentLimit: 500_000_000n,
      dailyLimit: 1_000_000_000n,
      maxProposalLifetime: 3600n,
      recovery: ctx.actor,
    });
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
    expect(plan.preview.policyNote).toMatch(/2-of-3/);
  });

  it("builds a complete deposit preview", async () => {
    const plan = await planTreasuryDeposit(ctx, 5_000_000_000n, "GNvXUHTZqP2wEeMjzL5BLH7X4zMhGjzoDMVK1wenMwRR");
    expect(plan.preview.amount).toEqual({ minor: "5000000000", decimals: 6, asset: "USDC" });
  });

  it("builds a payment proposal with the exact recipient and amount", async () => {
    const plan = await planProposePayment(ctx, {
      invoiceKey: new Uint8Array(32).fill(3),
      revision: 1,
      recipientOwner: ctx.entity,
      grossAmount: 500_000_000n,
    });
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
    expect(plan.preview.recipientOwner).toBe(ctx.entity);
    expect(plan.preview.amount?.minor).toBe("500000000");
  });

  it("builds an execute plan naming the recipient token account", async () => {
    const plan = await planExecutePayment(ctx, {
      invoiceKey: new Uint8Array(32).fill(3),
      revision: 1,
      recipientTokenAccount: "GNvXUHTZqP2wEeMjzL5BLH7X4zMhGjzoDMVK1wenMwRR",
      grossAmountMinor: 500_000_000n,
    });
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
    // Execute has the full 10-account shape from the IDL.
    expect(plan.instructions[0]!.accounts).toHaveLength(10);
  });
});
