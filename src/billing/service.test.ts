import { describe, expect, it } from "vitest";
import type { SolanaDeployment } from "@/config/solana";
import { previewIsComplete } from "@/contracts/preview";
import { planCreateVault, planDeposit, planRevokeMandate, vaultAddresses, type BillingPlanContext } from "./service";

const deployment: SolanaDeployment = {
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  serviceBalanceProgram: "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb",
  treasuryPayablesProgram: "33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
};

const ctx: BillingPlanContext = {
  deployment,
  merchant: "HGkuzNQECFbbyKpANTufU1ppBBDaYnTCFaoVUYqrfFYR",
  controller: "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp",
  controllerTokenAccount: "GNvXUHTZqP2wEeMjzL5BLH7X4zMhGjzoDMVK1wenMwRR",
};

describe("billing plans", () => {
  it("derives the vault family deterministically", async () => {
    const a = await vaultAddresses(ctx);
    const b = await vaultAddresses(ctx);
    expect(a).toEqual(b);
    expect(a.vault).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("builds a complete create-vault preview", async () => {
    const plan = await planCreateVault(ctx);
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0]!.programId).toBe(deployment.serviceBalanceProgram);
    // controller is the signer, fee payer and first account.
    expect(plan.instructions[0]!.accounts[0]!.signer).toBe(true);
  });

  it("builds a complete deposit preview with the exact amount", async () => {
    const plan = await planDeposit(ctx, 100_000_000n);
    expect(plan.preview.amount).toEqual({ minor: "100000000", decimals: 6, asset: "USDC" });
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
  });

  it("builds a revoke preview that needs no amount", async () => {
    const plan = await planRevokeMandate(ctx);
    expect(plan.preview.amount).toBeUndefined();
    expect(previewIsComplete(plan.preview)).toEqual({ ok: true });
    // The revoke instruction has exactly three accounts: controller, vault, mandate.
    expect(plan.instructions[0]!.accounts.map((a) => a.address)).toHaveLength(3);
  });
});
