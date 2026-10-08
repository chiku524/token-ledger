"use server";

/**
 * Server actions for Accounts Payable.
 *
 * Two kinds live here:
 * - **record writes** (supplier, invoice, treasury) that persist the app's private
 *   data after the same guards the rest of the app uses; and
 * - **prepare** actions that turn a company intent into a library-free plan the
 *   browser simulates, signs and submits. The server never signs or holds a key.
 *
 * A treasury, proposal and settlement projection is written only by the indexer
 * after a finalized slot; nothing here writes chain-derived state.
 */
import { eq } from "drizzle-orm";
import { assertCsrf, AuthError, requireSession, actorName } from "@/auth/current";
import { canAccessEntity } from "@/auth/roles";
import {
  planApprovePayment,
  planCancelPayment,
  planExecutePayment,
  planInitializeTreasury,
  planProposePayment,
  planRevokeApproval,
  planTreasuryDeposit,
  type TreasuryPlanContext,
} from "@/treasury/service";
import { invoiceKeyFromHex } from "@/contracts/pda";
import { serializePlan, type SerializablePlan } from "@/contracts/serialize";
import { newInvoiceKeyHex, normalizeReference } from "@/treasury/invoice";
import { USDC_DECIMALS, solanaDeployment, type SolanaDeployment } from "@/config/solana";
import { canWriteBooks } from "@/data/authorized-books";
import { loadBooks } from "@/data/load-books";
import { toMinor } from "@/ledger";
import { createInvoice, createSupplier, listTreasuries } from "@/db/treasury";
import { getDb } from "@/db/client";
import { invoices, paymentProposals } from "@/db/schema";
import { fail, finish } from "./form-state";

const PATH = "/dashboard/treasury";
const OFF = "The contract features are not configured on this deployment.";
const READ_ONLY = "Connect a database to save changes. This demo and the sample are read-only.";

export type PreparedPlan = { plan: SerializablePlan } | { error: string };

async function guard(formData: FormData, entityId: string): Promise<{ ok: true; deployment: SolanaDeployment; organizationId: string; actor: string } | { ok: false; error: string }> {
  try {
    await assertCsrf(formData);
  } catch (error) {
    return { ok: false, error: error instanceof AuthError ? error.message : "The form expired. Refresh and try again." };
  }
  const session = await requireSession();
  if (!canWriteBooks(session)) return { ok: false, error: READ_ONLY };
  if (!canAccessEntity(session, entityId)) return { ok: false, error: "That company is outside your access." };
  let deployment: SolanaDeployment | null;
  try {
    deployment = solanaDeployment();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : OFF };
  }
  if (!deployment) return { ok: false, error: OFF };
  const books = await loadBooks(session.organizationId);
  if (!books.entities.some((entity) => entity.id === entityId)) return { ok: false, error: "Choose a company in this organization." };
  return { ok: true, deployment, organizationId: session.organizationId, actor: actorName(session) };
}

function plan(input: { instructions: Parameters<typeof serializePlan>[0]["instructions"]; preview: Parameters<typeof serializePlan>[0]["preview"]; feePayer: string }): PreparedPlan {
  return { plan: serializePlan(input) };
}

// --- Record writes (private app data, off-chain) --------------------------------

/** Add a supplier for an entity. */
export async function createSupplierAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const entityId = String(formData.get("entityId") ?? "");
  if (!canAccessEntity(session, entityId)) fail(PATH, "That company is outside your access.");
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);
  try {
    await assertCsrf(formData);
  } catch {
    fail(PATH, "The form expired. Refresh and try again.");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 200) fail(PATH, "Enter the supplier name.");
  try {
    await createSupplier(
      { organizationId: session.organizationId, entityId, name, normalizedName: name.toUpperCase().replace(/\s+/g, " ").trim(), createdBy: session.id },
      actorName(session),
    );
  } catch {
    fail(PATH, "That supplier already exists for this company.");
  }
  finish(PATH, `Added ${name}.`);
}

/** Record a private invoice. The on-chain key is fixed on the first proposal. */
export async function createInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const entityId = String(formData.get("entityId") ?? "");
  if (!canAccessEntity(session, entityId)) fail(PATH, "That company is outside your access.");
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);
  try {
    await assertCsrf(formData);
  } catch {
    fail(PATH, "The form expired. Refresh and try again.");
  }
  const supplierId = String(formData.get("supplierId") ?? "");
  const reference = String(formData.get("supplierReference") ?? "").trim();
  if (!reference || reference.length > 100) fail(PATH, "Enter the supplier's invoice reference.");
  const amountMinor = parseUsdc(formData.get("amount"));
  if (amountMinor === null || amountMinor <= 0n) fail(PATH, "Enter the invoice amount in USDC.");
  try {
    await createInvoice(
      {
        organizationId: session.organizationId,
        entityId,
        supplierId,
        invoiceKey: newInvoiceKeyHex(),
        supplierReference: reference,
        normalizedReference: normalizeReference(reference),
        currency: "USDC",
        amountMinor,
        createdBy: session.id,
      },
      actorName(session),
    );
  } catch {
    fail(PATH, "That invoice reference is already recorded for this supplier.");
  }
  finish(PATH, "Invoice recorded.");
}

// --- Prepare actions (chain intents) --------------------------------------------

/** Company: initialize a treasury with a policy (threshold, limits, recovery). */
export async function prepareInitializeTreasury(formData: FormData): Promise<PreparedPlan> {
  const entityId = String(formData.get("entityId") ?? "");
  const guarded = await guard(formData, entityId);
  if (!guarded.ok) return { error: guarded.error };
  const { deployment } = guarded;
  const actor = String(formData.get("actor") ?? "").trim();
  if (!actor) return { error: "Connect the wallet that will initialize the treasury." };
  const approvers = splitAddresses(formData.get("approvers"));
  const proposers = splitAddresses(formData.get("proposers"));
  const threshold = Number(formData.get("threshold") ?? 0);
  if (threshold < 1 || threshold > approvers.length) return { error: "The threshold must be between 1 and the number of approvers." };
  const perPaymentLimit = parseUsdc(formData.get("perPaymentLimit"));
  const dailyLimit = parseUsdc(formData.get("dailyLimit"));
  if (perPaymentLimit === null || dailyLimit === null || perPaymentLimit <= 0n || dailyLimit <= 0n) {
    return { error: "Enter the per-payment and daily limits in USDC." };
  }
  const recovery = String(formData.get("recovery") ?? "").trim();
  if (!recovery) return { error: "Enter the recovery wallet." };
  const lifetimeDays = Number(formData.get("maxProposalLifetimeDays") ?? 7);

  const built = await planInitializeTreasury(
    { deployment, entity: entityId, actor },
    {
      mint: deployment.usdcMint,
      tokenProgram: deployment.tokenProgram,
      threshold,
      approvers,
      proposers,
      perPaymentLimit,
      dailyLimit,
      maxProposalLifetime: BigInt(Math.max(1, lifetimeDays) * 86_400),
      recovery,
    },
  );
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: actor });
}

/** Company: fund the treasury. */
export async function prepareTreasuryDeposit(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const amountMinor = parseUsdc(formData.get("amount"));
  if (amountMinor === null || amountMinor <= 0n) return { error: "Enter a deposit amount in USDC." };
  const funderToken = String(formData.get("funderTokenAccount") ?? "").trim();
  if (!funderToken) return { error: "Enter the funder USDC account." };
  const built = await planTreasuryDeposit(resolved.ctx, amountMinor, funderToken);
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

/** A proposer: propose a supplier payment for an invoice. */
export async function prepareProposePayment(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const [invoice] = await getDb().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || invoice.organizationId !== resolved.organizationId) return { error: "That invoice is not in this organization." };
  const recipientOwner = String(formData.get("recipientOwner") ?? "").trim();
  if (!recipientOwner) return { error: "Enter the supplier's USDC owner address." };
  const revision = await nextRevision(resolved.organizationId, invoiceId);
  const built = await planProposePayment(resolved.ctx, {
    invoiceKey: invoiceKeyFromHex(invoice.invoiceKey),
    revision,
    recipientOwner,
    grossAmount: invoice.amountMinor,
  });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

/** An approver: approve a proposal. */
export async function prepareApprovePayment(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const proposal = await loadProposal(resolved.organizationId, String(formData.get("proposalId") ?? ""));
  if (!proposal) return { error: "That proposal is not in this organization." };
  const built = await planApprovePayment(resolved.ctx, { invoiceKey: invoiceKeyFromHex(proposal.invoiceKey), revision: proposal.revision });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

/** An approver: withdraw an approval. */
export async function prepareRevokeApproval(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const proposal = await loadProposal(resolved.organizationId, String(formData.get("proposalId") ?? ""));
  if (!proposal) return { error: "That proposal is not in this organization." };
  const built = await planRevokeApproval(resolved.ctx, { invoiceKey: invoiceKeyFromHex(proposal.invoiceKey), revision: proposal.revision });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

/** A proposer: cancel a proposal before execution. */
export async function prepareCancelPayment(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const proposal = await loadProposal(resolved.organizationId, String(formData.get("proposalId") ?? ""));
  if (!proposal) return { error: "That proposal is not in this organization." };
  const built = await planCancelPayment(resolved.ctx, { invoiceKey: invoiceKeyFromHex(proposal.invoiceKey), revision: proposal.revision });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

/** Any signer: execute an approved payment, once quorum is met. */
export async function prepareExecutePayment(formData: FormData): Promise<PreparedPlan> {
  const resolved = await resolveTreasury(formData);
  if (!resolved.ok) return { error: resolved.error };
  const proposal = await loadProposal(resolved.organizationId, String(formData.get("proposalId") ?? ""));
  if (!proposal) return { error: "That proposal is not in this organization." };
  const recipientToken = String(formData.get("recipientTokenAccount") ?? "").trim();
  if (!recipientToken) return { error: "Enter the supplier's USDC token account." };
  const built = await planExecutePayment(resolved.ctx, {
    invoiceKey: invoiceKeyFromHex(proposal.invoiceKey),
    revision: proposal.revision,
    recipientTokenAccount: recipientToken,
    grossAmountMinor: proposal.grossAmountMinor,
  });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.actor });
}

// --- Helpers --------------------------------------------------------------------

async function resolveTreasury(formData: FormData): Promise<{ ok: true; ctx: TreasuryPlanContext; organizationId: string } | { ok: false; error: string }> {
  const entityId = String(formData.get("entityId") ?? "");
  const guarded = await guard(formData, entityId);
  if (!guarded.ok) return guarded;
  const actor = String(formData.get("actor") ?? "").trim();
  if (!actor) return { ok: false, error: "Connect a signer wallet." };
  const treasuries = await listTreasuries(guarded.organizationId);
  const treasury = treasuries.find((item) => item.id === String(formData.get("treasuryId") ?? ""));
  if (!treasury) return { ok: false, error: "Choose the treasury for this company." };
  return { ok: true, ctx: { deployment: guarded.deployment, entity: entityId, actor }, organizationId: guarded.organizationId };
}

async function loadProposal(organizationId: string, proposalId: string) {
  const [row] = await getDb().select().from(paymentProposals).where(eq(paymentProposals.id, proposalId)).limit(1);
  return row && row.organizationId === organizationId ? row : null;
}

async function nextRevision(organizationId: string, invoiceId: string): Promise<number> {
  const rows = await getDb().select().from(paymentProposals).where(eq(paymentProposals.invoiceId, invoiceId));
  const mine = rows.filter((row) => row.organizationId === organizationId);
  return mine.reduce((max, row) => Math.max(max, row.revision), -1) + 1;
}

function splitAddresses(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseUsdc(value: FormDataEntryValue | null): bigint | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    return toMinor(text, USDC_DECIMALS);
  } catch {
    return null;
  }
}
