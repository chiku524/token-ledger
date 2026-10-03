/**
 * Service Balance application service: turns a user intent into an unsigned,
 * reviewable transaction the customer's wallet signs. It holds no key and
 * submits nothing — the execution boundary (#170) does that. Every method
 * returns a `PreparedTransaction` with a complete preview, so the app can show
 * the action, amount, recipient and policy before a signature.
 *
 * Seeds and account order mirror `contracts/programs/service-balance`; the
 * instruction discriminators and argument layouts are pinned to the committed
 * IDL by `src/contracts/instructions`.
 */
import type { SolanaDeployment } from "@/config/solana";
import {
  encodeActivateMandate,
  encodeCollectCycle,
  encodeCreateBillingVault,
  encodeCreatePlanVersion,
  encodeDeposit,
  encodeReplaceMandate,
  encodeRevokeMandate,
  encodeWithdraw,
} from "@/contracts/instructions";
import {
  findProgramAddress,
  seedBillingVault,
  seedBillingVaultToken,
  seedChargeReceipt,
  seedMandate,
  seedMerchant,
  seedPlanVersion,
} from "@/contracts/pda";
import { previewLine, type PreviewAction, type TransactionPreview } from "@/contracts/preview";
import { SPL_TOKEN_PROGRAM, USDC_DECIMALS } from "@/config/solana";

/** A program instruction with resolved accounts, before it becomes a message. */
export interface PlannedInstruction {
  programId: string;
  /** Account addresses in program order. */
  accounts: { address: string; signer: boolean; writable: boolean }[];
  data: Uint8Array;
}

export interface BillingPlan {
  action: PreviewAction;
  instructions: PlannedInstruction[];
  preview: TransactionPreview;
}

/** The rent sysvar, needed by `create_billing_vault`. */
export const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111";

export interface BillingPlanContext {
  deployment: SolanaDeployment;
  /** The merchant admin address (the merchant PDA seed). */
  merchant: string;
  /** The customer's controller wallet, the fee payer and signer. */
  controller: string;
  /** The customer's USDC token account, for deposit/withdraw. */
  controllerTokenAccount: string;
}

function account(address: string, opts: { signer?: boolean; writable?: boolean } = {}) {
  return { address, signer: opts.signer ?? false, writable: opts.writable ?? false };
}

/** Derive the whole vault family for a controller under a merchant. */
export async function vaultAddresses(ctx: BillingPlanContext) {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { address: vault } = await findProgramAddress(seedBillingVault(ctx.merchant, ctx.controller), programId);
  const { address: vaultAuthority } = await findProgramAddress(
    seedBillingVault(ctx.merchant, ctx.controller),
    programId,
  );
  const { address: vaultToken } = await findProgramAddress(seedBillingVaultToken(vault), programId);
  const { address: mandate } = await findProgramAddress(seedMandate(vault), programId);
  return { vault, vaultAuthority, vaultToken, mandate };
}

export async function planCreateVault(ctx: BillingPlanContext): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, vaultAuthority, vaultToken } = await vaultAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true, writable: true }),
      account(ctx.merchant, { writable: true }),
      account(vault, { writable: true }),
      account(vaultAuthority),
      account(ctx.deployment.usdcMint),
      account(vaultToken, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
      account("11111111111111111111111111111111"),
      account(RENT_SYSVAR),
    ],
    data: encodeCreateBillingVault(ctx.controller),
  };
  return {
    action: "billing.create_vault",
    instructions: [instruction],
    preview: {
      action: "billing.create_vault",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      subject: vault,
      policyNote: "Creates a billing vault you control. It holds no funds until you deposit.",
    },
  };
}

export async function planDeposit(ctx: BillingPlanContext, amountMinor: bigint): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, vaultToken } = await vaultAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true, writable: true }),
      account(vault, { writable: true }),
      account(ctx.controllerTokenAccount, { writable: true }),
      account(vaultToken, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
    ],
    data: encodeDeposit(amountMinor),
  };
  return {
    action: "billing.deposit",
    instructions: [instruction],
    preview: {
      action: "billing.deposit",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      amount: { minor: amountMinor.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      subject: vault,
      policyNote: "Deposits USDC into your billing vault. A deposit alone does not enable charging.",
    },
  };
}

export async function planWithdraw(ctx: BillingPlanContext, amountMinor: bigint): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, vaultAuthority, vaultToken } = await vaultAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true, writable: true }),
      account(vault, { writable: true }),
      account(vaultAuthority),
      account(vaultToken, { writable: true }),
      account(ctx.controllerTokenAccount, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
    ],
    data: encodeWithdraw(amountMinor),
  };
  return {
    action: "billing.withdraw",
    instructions: [instruction],
    preview: {
      action: "billing.withdraw",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      amount: { minor: amountMinor.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      recipientOwner: ctx.controller,
      subject: vault,
      policyNote: "Withdraws unspent balance to your own account. No merchant signature is needed.",
    },
  };
}

export async function planActivateMandate(
  ctx: BillingPlanContext,
  args: { planId: Uint8Array; planVersion: number; maxTotalDebit: bigint; authorizationExpiry: bigint; destinationTokenAccount: string },
): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, vaultAuthority, vaultToken, mandate } = await vaultAddresses(ctx);
  const { address: plan } = await findProgramAddress(
    seedPlanVersion(ctx.merchant, args.planId, args.planVersion),
    programId,
  );
  const { address: receipt } = await findProgramAddress(seedChargeReceipt(mandate, 0n), programId);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true, writable: true }),
      account(vault, { writable: true }),
      account(plan),
      account(mandate, { writable: true }),
      account(receipt, { writable: true }),
      account(ctx.merchant),
      account(vaultAuthority),
      account(vaultToken, { writable: true }),
      account(args.destinationTokenAccount, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
      account("11111111111111111111111111111111"),
    ],
    data: encodeActivateMandate({ maxTotalDebit: args.maxTotalDebit, authorizationExpiry: args.authorizationExpiry }),
  };
  return {
    action: "billing.activate",
    instructions: [instruction],
    preview: {
      action: "billing.activate",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      amount: { minor: args.maxTotalDebit.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      recipientOwner: ctx.merchant,
      subject: mandate,
      policyNote:
        "Signs a bounded mandate and charges the first 30-day period. The cap and expiry are fixed; you can revoke and withdraw at any time.",
    },
  };
}

export async function planCollectCycle(
  ctx: BillingPlanContext,
  args: { cycle: bigint; destinationTokenAccount: string },
): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, vaultAuthority, vaultToken, mandate } = await vaultAddresses(ctx);
  const { address: receipt } = await findProgramAddress(seedChargeReceipt(mandate, args.cycle), programId);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true, writable: true }),
      account(ctx.merchant),
      account(vault, { writable: true }),
      account(mandate, { writable: true }),
      account(receipt, { writable: true }),
      account(vaultAuthority),
      account(vaultToken, { writable: true }),
      account(args.destinationTokenAccount, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
      account("11111111111111111111111111111111"),
    ],
    data: encodeCollectCycle(args.cycle),
  };
  return {
    action: "billing.collect",
    instructions: [instruction],
    preview: {
      action: "billing.collect",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      subject: mandate,
      recipientOwner: ctx.merchant,
      policyNote: "Collects the next 30-day period at the signed price, within the signed cap and expiry.",
    },
  };
}

export async function planRevokeMandate(ctx: BillingPlanContext): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, mandate } = await vaultAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true }),
      account(vault, { writable: true }),
      account(mandate, { writable: true }),
    ],
    data: encodeRevokeMandate(),
  };
  return {
    action: "billing.revoke",
    instructions: [instruction],
    preview: {
      action: "billing.revoke",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      subject: mandate,
      policyNote: "Stops future renewals. Paid access continues to its recorded end. Balances remain withdrawable.",
    },
  };
}

export async function planReplaceMandate(
  ctx: BillingPlanContext,
  args: { planId: Uint8Array; planVersion: number; maxTotalDebit: bigint; authorizationExpiry: bigint },
): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { vault, mandate } = await vaultAddresses(ctx);
  const { address: plan } = await findProgramAddress(
    seedPlanVersion(ctx.merchant, args.planId, args.planVersion),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.controller, { signer: true }),
      account(vault, { writable: true }),
      account(plan),
      account(mandate, { writable: true }),
    ],
    data: encodeReplaceMandate({ maxTotalDebit: args.maxTotalDebit, authorizationExpiry: args.authorizationExpiry }),
  };
  return {
    action: "billing.replace",
    instructions: [instruction],
    preview: {
      action: "billing.replace",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.controller,
      amount: { minor: args.maxTotalDebit.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      subject: mandate,
      policyNote:
        "Replaces the mandate in place. Paid-through time is preserved, so overlapping coverage is not charged twice.",
    },
  };
}

/**
 * Merchant-side: publish an immutable plan version. Signed by the merchant
 * admin, not the customer. The merchant PDA is seeded by the admin address.
 */
export async function planCreatePlanVersion(
  ctx: { deployment: SolanaDeployment; admin: string; planId: Uint8Array; version: number; price: bigint; maxPeriods: number },
): Promise<BillingPlan> {
  const programId = ctx.deployment.serviceBalanceProgram;
  const { address: merchant } = await findProgramAddress(seedMerchant(ctx.admin), programId);
  const { address: plan } = await findProgramAddress(seedPlanVersion(merchant, ctx.planId, ctx.version), programId);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.admin, { signer: true, writable: true }),
      account(merchant),
      account(plan, { writable: true }),
      account("11111111111111111111111111111111"),
    ],
    data: encodeCreatePlanVersion({ planId: ctx.planId, version: ctx.version, price: ctx.price, maxPeriods: ctx.maxPeriods }),
  };
  return {
    action: "billing.create_plan",
    instructions: [instruction],
    preview: {
      action: "billing.create_plan",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.admin,
      amount: { minor: ctx.price.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      subject: plan,
      policyNote: "Publishes an immutable plan version: a fixed price per 30-day period. Existing mandates are unaffected.",
    },
  };
}

/**
 * A stable identity for one planned operation, so a retry reuses the same
 * logical operation id rather than creating a second one (see #161's outbox).
 */
export function billingOperationId(action: PreviewAction, subject: string): string {
  return `${action}:${subject}`;
}

export { previewLine };
