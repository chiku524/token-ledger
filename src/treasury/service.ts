/**
 * Accounts Payable treasury application service: turn a company intent into an
 * unsigned, reviewable transaction. Holds no key and submits nothing.
 *
 * The chain enforces quorum, caps and one-settlement-per-invoice. The app's job
 * is to enforce what the chain cannot: normalized supplier + reference
 * uniqueness before an invoice ever becomes a proposal (see `normalizeReference`).
 */
import type { SolanaDeployment } from "@/config/solana";
import { SPL_TOKEN_PROGRAM, USDC_DECIMALS } from "@/config/solana";
import {
  encodeApproveGovernance,
  encodeApprovePayment,
  encodeCancelPayment,
  encodeExecuteEmergencyExit,
  encodeExecutePayment,
  encodeExecutePolicyChange,
  encodeInitializeTreasury,
  encodePauseExecution,
  encodeProposeGovernance,
  encodeProposePayment,
  encodeRevokeApproval,
  encodeTreasuryDeposit,
  type GovernanceKind,
} from "@/contracts/instructions";
import {
  findProgramAddress,
  seedDailySpend,
  seedGovernanceProposal,
  seedInvoiceSettlement,
  seedPaymentProposal,
  seedTreasuryAuthority,
  seedTreasuryConfig,
  seedTreasuryToken,
} from "@/contracts/pda";
import type { PreviewAction, TransactionPreview } from "@/contracts/preview";
import type { BillingPlan, PlannedInstruction } from "@/billing/service";
import { RENT_SYSVAR } from "@/billing/service";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

function account(address: string, opts: { signer?: boolean; writable?: boolean } = {}) {
  return { address, signer: opts.signer ?? false, writable: opts.writable ?? false };
}

export interface TreasuryPlanContext {
  deployment: SolanaDeployment;
  /** The legal entity the treasury serves. */
  entity: string;
  /** The signer/fee payer for this action (a proposer, approver, or executor). */
  actor: string;
}

const KIND_INDEX: Record<GovernanceKind, number> = { PolicyChange: 0, Unpause: 1, EmergencyExit: 2 };

/** Derive the treasury family for an entity. */
export async function treasuryAddresses(ctx: TreasuryPlanContext) {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { address: treasury } = await findProgramAddress(seedTreasuryConfig(ctx.entity), programId);
  const { address: treasuryAuthority } = await findProgramAddress(seedTreasuryAuthority(treasury), programId);
  const { address: treasuryToken } = await findProgramAddress(seedTreasuryToken(treasury), programId);
  return { treasury, treasuryAuthority, treasuryToken };
}

export async function planInitializeTreasury(
  ctx: TreasuryPlanContext,
  args: {
    mint: string;
    tokenProgram: string;
    threshold: number;
    approvers: string[];
    proposers: string[];
    perPaymentLimit: bigint;
    dailyLimit: bigint;
    maxProposalLifetime: bigint;
    recovery: string;
  },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury, treasuryAuthority, treasuryToken } = await treasuryAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true, writable: true }),
      account(ctx.entity),
      account(treasury, { writable: true }),
      account(treasuryAuthority),
      account(args.mint),
      account(treasuryToken, { writable: true }),
      account(args.tokenProgram || SPL_TOKEN_PROGRAM),
      account(SYSTEM_PROGRAM),
      account(RENT_SYSVAR),
    ],
    data: encodeInitializeTreasury({ ...args, entity: ctx.entity }),
  };
  return {
    action: "treasury.initialize",
    instructions: [instruction],
    preview: {
      action: "treasury.initialize",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      subject: treasury,
      policyNote: `Creates a ${args.threshold}-of-${args.approvers.length} treasury. Every payment needs ${args.threshold} distinct approvals. Token Ledger support has no override.`,
    },
  };
}

export async function planTreasuryDeposit(ctx: TreasuryPlanContext, amountMinor: bigint, funderTokenAccount: string): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury, treasuryToken } = await treasuryAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true, writable: true }),
      account(treasury, { writable: true }),
      account(funderTokenAccount, { writable: true }),
      account(treasuryToken, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
    ],
    data: encodeTreasuryDeposit(amountMinor),
  };
  return {
    action: "treasury.deposit",
    instructions: [instruction],
    preview: {
      action: "treasury.deposit",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      amount: { minor: amountMinor.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      subject: treasury,
      policyNote: "Funds the company treasury. No connected read-only wallet is swept.",
    },
  };
}

export async function planProposePayment(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number; recipientOwner: string; grossAmount: bigint },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const { address: settlement } = await findProgramAddress(seedInvoiceSettlement(treasury, args.invoiceKey), programId);
  const { address: proposal } = await findProgramAddress(
    seedPaymentProposal(treasury, args.invoiceKey, args.revision),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true, writable: true }),
      account(treasury, { writable: true }),
      account(settlement, { writable: true }),
      account(proposal, { writable: true }),
      account(ctx.deployment.usdcMint),
      account(SYSTEM_PROGRAM),
    ],
    data: encodeProposePayment(args),
  };
  return {
    action: "treasury.propose",
    instructions: [instruction],
    preview: {
      action: "treasury.propose",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      amount: { minor: args.grossAmount.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      recipientOwner: args.recipientOwner,
      subject: proposal,
      policyNote: `Proposes a supplier payment (revision ${args.revision}). It cannot execute until quorum approves.`,
    },
  };
}

export async function planApprovePayment(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number },
): Promise<BillingPlan> {
  return simpleProposalPlan(ctx, args, "treasury.approve", "approve_payment", encodeApprovePayment(), (proposal) => ({
    action: "treasury.approve",
    cluster: ctx.deployment.cluster,
    programId: ctx.deployment.treasuryPayablesProgram,
    feePayer: ctx.actor,
    subject: proposal,
    policyNote: "Records your approval. The payment still needs the policy threshold of distinct approvals.",
  }));
}

export async function planRevokeApproval(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number },
): Promise<BillingPlan> {
  return simpleProposalPlan(ctx, args, "treasury.revoke_approval", "revoke_approval", encodeRevokeApproval(), (proposal) => ({
    action: "treasury.revoke_approval",
    cluster: ctx.deployment.cluster,
    programId: ctx.deployment.treasuryPayablesProgram,
    feePayer: ctx.actor,
    subject: proposal,
    policyNote: "Withdraws your approval. Readiness recalculates; below quorum it cannot execute.",
  }));
}

export async function planCancelPayment(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number },
): Promise<BillingPlan> {
  return simpleProposalPlan(ctx, args, "treasury.cancel", "cancel_payment", encodeCancelPayment(), (proposal) => ({
    action: "treasury.cancel",
    cluster: ctx.deployment.cluster,
    programId: ctx.deployment.treasuryPayablesProgram,
    feePayer: ctx.actor,
    subject: proposal,
    policyNote: "Cancels the proposal before execution. The invoice can be re-proposed with a new revision.",
  }));
}

export async function planExecutePayment(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number; recipientTokenAccount: string; grossAmountMinor: bigint },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury, treasuryAuthority, treasuryToken } = await treasuryAddresses(ctx);
  const { address: settlement } = await findProgramAddress(seedInvoiceSettlement(treasury, args.invoiceKey), programId);
  const { address: proposal } = await findProgramAddress(
    seedPaymentProposal(treasury, args.invoiceKey, args.revision),
    programId,
  );
  const { address: dailySpend } = await findProgramAddress(seedDailySpend(treasury), programId);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true, writable: true }),
      account(treasury, { writable: true }),
      account(proposal, { writable: true }),
      account(settlement, { writable: true }),
      account(treasuryAuthority),
      account(treasuryToken, { writable: true }),
      account(args.recipientTokenAccount, { writable: true }),
      account(dailySpend, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
      account(SYSTEM_PROGRAM),
    ],
    data: encodeExecutePayment(),
  };
  return {
    action: "treasury.execute",
    instructions: [instruction],
    preview: {
      action: "treasury.execute",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      amount: { minor: args.grossAmountMinor.toString(), decimals: USDC_DECIMALS, asset: "USDC" },
      recipientOwner: args.recipientTokenAccount,
      subject: proposal,
      policyNote:
        "Executes an already-approved payment. Every rule (quorum, caps, recipient, policy version) is rechecked at execution.",
    },
  };
}

export async function planPauseExecution(ctx: TreasuryPlanContext): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const instruction: PlannedInstruction = {
    programId,
    accounts: [account(ctx.actor, { signer: true }), account(treasury, { writable: true })],
    data: encodePauseExecution(),
  };
  return {
    action: "treasury.pause",
    instructions: [instruction],
    preview: {
      action: "treasury.pause",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      subject: treasury,
      policyNote: "Any approver can pause supplier execution. Governance and the emergency exit remain available.",
    },
  };
}

export async function planProposeGovernance(
  ctx: TreasuryPlanContext,
  args: {
    kind: GovernanceKind;
    policyVersion: bigint;
    newThreshold: number;
    newApprovers: string[];
    newPerPaymentLimit: bigint;
    newDailyLimit: bigint;
    newRecovery: string;
  },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const { address: governance } = await findProgramAddress(
    seedGovernanceProposal(treasury, args.policyVersion, KIND_INDEX[args.kind]),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true, writable: true }),
      account(treasury),
      account(governance, { writable: true }),
      account(SYSTEM_PROGRAM),
    ],
    data: encodeProposeGovernance({
      kind: args.kind,
      newThreshold: args.newThreshold,
      newApproverCount: args.newApprovers.length,
      newApprovers: args.newApprovers,
      newPerPaymentLimit: args.newPerPaymentLimit,
      newDailyLimit: args.newDailyLimit,
      newRecovery: args.newRecovery,
    }),
  };
  return {
    action: "treasury.governance",
    instructions: [instruction],
    preview: {
      action: "treasury.governance",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      subject: governance,
      policyNote:
        "Proposes a governance action (policy change, unpause, or emergency exit). It needs the current threshold to execute.",
    },
  };
}

export async function planApproveGovernance(
  ctx: TreasuryPlanContext,
  args: { kind: GovernanceKind; policyVersion: bigint },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const { address: governance } = await findProgramAddress(
    seedGovernanceProposal(treasury, args.policyVersion, KIND_INDEX[args.kind]),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [account(ctx.actor, { signer: true }), account(treasury), account(governance, { writable: true })],
    data: encodeApproveGovernance(),
  };
  return {
    action: "treasury.governance",
    instructions: [instruction],
    preview: {
      action: "treasury.governance",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      subject: governance,
      policyNote: "Approves the governance proposal under the current threshold.",
    },
  };
}

export async function planExecutePolicyChange(
  ctx: TreasuryPlanContext,
  args: { kind: GovernanceKind; policyVersion: bigint },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const { address: governance } = await findProgramAddress(
    seedGovernanceProposal(treasury, args.policyVersion, KIND_INDEX[args.kind]),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [account(ctx.actor, { signer: true }), account(treasury, { writable: true }), account(governance, { writable: true })],
    data: encodeExecutePolicyChange(),
  };
  return {
    action: "treasury.governance",
    instructions: [instruction],
    preview: {
      action: "treasury.governance",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      subject: governance,
      policyNote: "Executes an approved policy change. A policy change makes all older proposals and approvals non-executable.",
    },
  };
}

export async function planExecuteEmergencyExit(
  ctx: TreasuryPlanContext,
  args: { policyVersion: bigint; recoveryTokenAccount: string },
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury, treasuryAuthority, treasuryToken } = await treasuryAddresses(ctx);
  const { address: governance } = await findProgramAddress(
    seedGovernanceProposal(treasury, args.policyVersion, KIND_INDEX.EmergencyExit),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [
      account(ctx.actor, { signer: true }),
      account(treasury, { writable: true }),
      account(governance, { writable: true }),
      account(treasuryAuthority),
      account(treasuryToken, { writable: true }),
      account(args.recoveryTokenAccount, { writable: true }),
      account(ctx.deployment.tokenProgram || SPL_TOKEN_PROGRAM),
    ],
    data: encodeExecuteEmergencyExit(),
  };
  return {
    action: "treasury.exit",
    instructions: [instruction],
    preview: {
      action: "treasury.exit",
      cluster: ctx.deployment.cluster,
      programId,
      feePayer: ctx.actor,
      recipientOwner: args.recoveryTokenAccount,
      subject: treasury,
      policyNote:
        "A quorum emergency exit to the registered recovery wallet. Works while paused; afterwards the treasury is closed to new payments.",
    },
  };
}

async function simpleProposalPlan(
  ctx: TreasuryPlanContext,
  args: { invoiceKey: Uint8Array; revision: number },
  action: PreviewAction,
  _instructionName: string,
  data: Uint8Array,
  preview: (proposal: string) => TransactionPreview,
): Promise<BillingPlan> {
  const programId = ctx.deployment.treasuryPayablesProgram;
  const { treasury } = await treasuryAddresses(ctx);
  const { address: proposal } = await findProgramAddress(
    seedPaymentProposal(treasury, args.invoiceKey, args.revision),
    programId,
  );
  const instruction: PlannedInstruction = {
    programId,
    accounts: [account(ctx.actor, { signer: true }), account(treasury), account(proposal, { writable: true })],
    data,
  };
  return { action, instructions: [instruction], preview: preview(proposal) };
}
