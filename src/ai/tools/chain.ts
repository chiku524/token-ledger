import { canAccessEntity } from "@/auth/roles";
import { prepareCreateVault, prepareDeposit, prepareRevoke, prepareWithdraw } from "@/app/dashboard/billing-actions";
import { prepareExecutePayment, prepareProposePayment } from "@/app/dashboard/treasury-actions";
import type { SerializablePlan } from "@/contracts/serialize";
import type { AgentTool, ToolContext, ToolResult } from "./types";

/**
 * On-chain prepare tools. These never sign or submit: they call the existing
 * prepare server actions (through FormData, reusing the same CSRF + permission
 * guards the Billing/Treasury pages use) and return the library-free
 * `SerializablePlan`. The runtime records the plan as a proposal; after a
 * confirmation the frontend hands it to the existing wallet-signing UX.
 *
 * A tool refuses when there is no request CSRF token, so it cannot silently
 * bypass the form guard. See docs/ai-chatbot.md §5 (prefer one user-visible
 * action; on-chain needs explicit confirmation).
 */

function toResult(prepared: { plan: SerializablePlan } | { error: string }, route: string, summary: string): ToolResult {
  if ("error" in prepared) return { summary: prepared.error, route };
  return { summary, data: { plan: prepared.plan }, route };
}

function form(ctx: ToolContext, fields: Record<string, string>): FormData {
  const data = new FormData();
  if (ctx.csrf) data.set("csrf", ctx.csrf);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function guard(ctx: ToolContext, entityId: string): string | null {
  if (!ctx.session.organizationId) return "No organization.";
  if (!canAccessEntity(ctx.session, entityId)) return "That company is outside your access.";
  return null;
}

export const prepareBillingVault: AgentTool = {
  name: "prepare_billing_vault",
  description:
    "Prepare a Service Balance billing vault for a company. Returns an unsigned transaction plan; the controller wallet signs in the app. No funds move until a deposit.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      controller: { type: "string", description: "The wallet address that will control the vault (must be bound to the company)." },
    },
    required: ["entityId", "controller"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/billing" };
    const prepared = await prepareCreateVault(form(ctx, { entityId, controller: String(input.controller ?? "") }));
    return toResult(prepared, "/dashboard/billing", "Vault plan ready — sign it in Billing to submit.");
  },
};

export const prepareBillingDeposit: AgentTool = {
  name: "prepare_billing_deposit",
  description: "Prepare a USDC deposit into a company's billing vault. Returns an unsigned plan for the controlling wallet to sign.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      vaultId: { type: "string" },
      controller: { type: "string" },
      tokenAccount: { type: "string", description: "The controller's USDC token account." },
      amount: { type: "string", description: "Amount in USDC, major units." },
    },
    required: ["entityId", "vaultId", "controller", "tokenAccount", "amount"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/billing" };
    const prepared = await prepareDeposit(
      form(ctx, {
        entityId,
        vaultId: String(input.vaultId ?? ""),
        controller: String(input.controller ?? ""),
        tokenAccount: String(input.tokenAccount ?? ""),
        amount: String(input.amount ?? ""),
      }),
    );
    return toResult(prepared, "/dashboard/billing", "Deposit plan ready — sign it in Billing to submit.");
  },
};

export const prepareBillingWithdraw: AgentTool = {
  name: "prepare_billing_withdraw",
  description: "Prepare a withdrawal of unspent USDC from a billing vault. No merchant signature is needed.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      vaultId: { type: "string" },
      controller: { type: "string" },
      tokenAccount: { type: "string" },
      amount: { type: "string" },
    },
    required: ["entityId", "vaultId", "controller", "tokenAccount", "amount"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/billing" };
    const prepared = await prepareWithdraw(
      form(ctx, {
        entityId,
        vaultId: String(input.vaultId ?? ""),
        controller: String(input.controller ?? ""),
        tokenAccount: String(input.tokenAccount ?? ""),
        amount: String(input.amount ?? ""),
      }),
    );
    return toResult(prepared, "/dashboard/billing", "Withdrawal plan ready — sign it in Billing to submit.");
  },
};

export const prepareBillingRevoke: AgentTool = {
  name: "prepare_billing_revoke",
  description: "Prepare to stop future billing renewals for a vault. Paid-through access remains and the balance stays withdrawable.",
  parameters: {
    type: "object",
    properties: { entityId: { type: "string" }, vaultId: { type: "string" }, controller: { type: "string" } },
    required: ["entityId", "vaultId", "controller"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/billing" };
    const prepared = await prepareRevoke(
      form(ctx, { entityId, vaultId: String(input.vaultId ?? ""), controller: String(input.controller ?? "") }),
    );
    return toResult(prepared, "/dashboard/billing", "Revoke plan ready — sign it in Billing to submit.");
  },
};

export const prepareTreasuryPayment: AgentTool = {
  name: "prepare_treasury_payment",
  description:
    "Prepare a supplier payment proposal from a company treasury for an invoice. Returns an unsigned plan; the proposer wallet signs, then approvers meet quorum.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      treasuryId: { type: "string" },
      actor: { type: "string", description: "The proposer wallet address." },
      invoiceId: { type: "string" },
      recipientOwner: { type: "string", description: "The supplier's USDC owner address." },
    },
    required: ["entityId", "treasuryId", "actor", "invoiceId", "recipientOwner"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/treasury" };
    const prepared = await prepareProposePayment(
      form(ctx, {
        entityId,
        treasuryId: String(input.treasuryId ?? ""),
        actor: String(input.actor ?? ""),
        invoiceId: String(input.invoiceId ?? ""),
        recipientOwner: String(input.recipientOwner ?? ""),
      }),
    );
    return toResult(prepared, "/dashboard/treasury", "Payment proposal ready — sign it in Treasury to submit.");
  },
};

export const prepareTreasuryExecute: AgentTool = {
  name: "prepare_treasury_execute",
  description: "Prepare execution of an approved treasury payment once quorum is met. The recipient token account is provided by the supplier.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      treasuryId: { type: "string" },
      actor: { type: "string" },
      proposalId: { type: "string" },
      recipientTokenAccount: { type: "string" },
    },
    required: ["entityId", "treasuryId", "actor", "proposalId", "recipientTokenAccount"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "source.connect",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guard(ctx, entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/treasury" };
    const prepared = await prepareExecutePayment(
      form(ctx, {
        entityId,
        treasuryId: String(input.treasuryId ?? ""),
        actor: String(input.actor ?? ""),
        proposalId: String(input.proposalId ?? ""),
        recipientTokenAccount: String(input.recipientTokenAccount ?? ""),
      }),
    );
    return toResult(prepared, "/dashboard/treasury", "Execution plan ready — sign it in Treasury to submit.");
  },
};

export const onChainTools: readonly AgentTool[] = [
  prepareBillingVault,
  prepareBillingDeposit,
  prepareBillingWithdraw,
  prepareBillingRevoke,
  prepareTreasuryPayment,
  prepareTreasuryExecute,
];
