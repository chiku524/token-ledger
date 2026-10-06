"use server";

/**
 * Server actions that *prepare* a Service Balance transaction and return a
 * library-free plan for the browser to simulate, sign and submit. They never
 * sign, submit, or touch a key: the customer's wallet does that. Nothing is
 * persisted here either — vault, mandate and charge projections are written only
 * after a finalized slot is observed (the indexer).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { actorName, assertCsrf, AuthError, requireSession } from "@/auth/current";
import { canAccessEntity } from "@/auth/roles";
import {
  planCreatePlanVersion,
  planCreateVault,
  planDeposit,
  planInitializeMerchant,
  planRevokeMandate,
  planWithdraw,
  type BillingPlanContext,
} from "@/billing/service";
import { findProgramAddress, seedMerchant } from "@/contracts/pda";
import { serializePlan, type SerializablePlan } from "@/contracts/serialize";
import { USDC_DECIMALS, solanaDeployment, type SolanaDeployment } from "@/config/solana";
import { canWriteBooks } from "@/data/authorized-books";
import { loadBooks } from "@/data/load-books";
import { toMinor } from "@/ledger";
import { listActiveWalletBindings } from "@/db/wallet-bindings";
import { findMerchantForCluster, upsertMerchant } from "@/db/merchant";
import { billingVaults } from "@/db/schema";
import { getDb } from "@/db/client";

export type PreparedPlan = { plan: SerializablePlan } | { error: string };

const OFF = "The contract features are not configured on this deployment.";
const READ_ONLY = "Connect a database to prepare transactions. This demo does not save them.";

/** Guard CSRF, session, a configured deployment and a writable, accessible entity. */
async function guard(
  formData: FormData,
  entityId: string,
): Promise<
  | { ok: true; deployment: SolanaDeployment; organizationId: string; actor: string }
  | { ok: false; error: string }
> {
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
  const books = await loadBooks(session.organizationId as string);
  if (!books.entities.some((entity) => entity.id === entityId)) return { ok: false, error: "Choose a company in this organization." };
  return { ok: true, deployment, organizationId: session.organizationId as string, actor: actorName(session) };
}

/**
 * The merchant PDA every billing action resolves. Prefer the merchant config
 * created from the app (the admin's own wallet); fall back to the deployment's
 * `MERCHANT_ADMIN_ADDRESS` for a deployment configured out of band.
 */
async function merchantFor(
  organizationId: string,
  deployment: SolanaDeployment,
): Promise<{ merchant: string; admin: string } | null> {
  const stored = await findMerchantForCluster(organizationId, deployment.cluster);
  if (stored) return { merchant: stored.merchantAddress, admin: stored.adminAddress };
  if (deployment.merchantAdmin) {
    const { address } = await findProgramAddress(seedMerchant(deployment.merchantAdmin), deployment.serviceBalanceProgram);
    return { merchant: address, admin: deployment.merchantAdmin };
  }
  return null;
}

function plan(planInput: { instructions: Parameters<typeof serializePlan>[0]["instructions"]; preview: Parameters<typeof serializePlan>[0]["preview"]; feePayer: string }): PreparedPlan {
  return { plan: serializePlan(planInput) };
}

/**
 * Merchant admin: create the merchant config, turning the connected wallet into
 * the merchant admin. Signed by that wallet, whose address seeds the merchant
 * PDA. Run once per deployment.
 */
export async function prepareInitializeMerchant(formData: FormData): Promise<PreparedPlan> {
  const entityId = String(formData.get("entityId") ?? "");
  const guarded = await guard(formData, entityId);
  if (!guarded.ok) return { error: guarded.error };
  const { deployment, organizationId, actor } = guarded;
  const admin = String(formData.get("controller") ?? "").trim();
  if (!admin) return { error: "Connect the wallet that will be the merchant admin." };
  const collector = String(formData.get("collector") ?? "").trim() || admin;
  const destination = String(formData.get("destination") ?? "").trim();
  if (!destination) return { error: "Enter the merchant USDC destination token account." };

  const built = await planInitializeMerchant({
    deployment,
    admin,
    collector,
    mint: deployment.usdcMint,
    destination,
  });
  const merchant = built.preview.subject ?? "";
  // Record the config so the billing actions resolve this merchant afterwards.
  await upsertMerchant(
    { organizationId, entityId, cluster: deployment.cluster, adminAddress: admin, merchantAddress: merchant, collectorAddress: collector, mint: deployment.usdcMint, destination },
    actor,
  );
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: admin });
}

/**
 * Merchant admin: publish an immutable plan version with a fixed price per
 * 30-day period. Signed by the merchant admin's wallet.
 */
export async function prepareCreatePlan(formData: FormData): Promise<PreparedPlan> {
  const entityId = String(formData.get("entityId") ?? "");
  const guarded = await guard(formData, entityId);
  if (!guarded.ok) return { error: guarded.error };
  const { deployment, organizationId } = guarded;
  const merchant = await merchantFor(organizationId, deployment);
  if (!merchant) return { error: "Initialize the merchant first, or set MERCHANT_ADMIN_ADDRESS." };
  const priceMinor = parseAmount(formData.get("price"));
  if (priceMinor === null || priceMinor <= 0n) return { error: "Enter the price per 30-day period in USDC." };
  const maxPeriods = Number(formData.get("maxPeriods") ?? 0);
  if (!Number.isInteger(maxPeriods) || maxPeriods < 1 || maxPeriods > 1000) return { error: "Choose a maximum number of periods." };

  const built = await planCreatePlanVersion({
    deployment,
    admin: merchant.admin,
    planId: randomBytes(16),
    version: 1,
    price: priceMinor,
    maxPeriods,
  });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: merchant.admin });
}

/** Customer: create the billing vault they control. Funded separately by deposit. */
export async function prepareCreateVault(formData: FormData): Promise<PreparedPlan> {
  const entityId = String(formData.get("entityId") ?? "");
  const guarded = await guard(formData, entityId);
  if (!guarded.ok) return { error: guarded.error };
  const { deployment, organizationId } = guarded;
  const controller = String(formData.get("controller") ?? "").trim();
  const bound = await requireBinding(organizationId, entityId, controller, deployment.cluster);
  if (!bound.ok) return { error: bound.error };
  const merchant = await merchantFor(organizationId, deployment);
  if (!merchant) return { error: "Initialize the merchant first, or set MERCHANT_ADMIN_ADDRESS." };

  const built = await planCreateVault({ deployment, merchant: merchant.merchant, controller, controllerTokenAccount: "" });
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: controller });
}

/** Customer: deposit USDC into their vault. */
export async function prepareDeposit(formData: FormData): Promise<PreparedPlan> {
  const vaultId = String(formData.get("vaultId") ?? "");
  const resolved = await resolveVault(formData, vaultId);
  if (!resolved.ok) return { error: resolved.error };
  const tokenAccount = String(formData.get("tokenAccount") ?? "").trim();
  if (!tokenAccount) return { error: "Enter your USDC token account for this cluster." };
  const amountMinor = parseAmount(formData.get("amount"));
  if (amountMinor === null || amountMinor <= 0n) return { error: "Enter a deposit amount in USDC." };
  const built = await planDeposit({ ...resolved.ctx, controllerTokenAccount: tokenAccount }, amountMinor);
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.controller });
}

/** Customer: withdraw unspent balance to their own USDC account. No merchant signature. */
export async function prepareWithdraw(formData: FormData): Promise<PreparedPlan> {
  const vaultId = String(formData.get("vaultId") ?? "");
  const resolved = await resolveVault(formData, vaultId);
  if (!resolved.ok) return { error: resolved.error };
  const tokenAccount = String(formData.get("tokenAccount") ?? "").trim();
  if (!tokenAccount) return { error: "Enter your USDC token account for this cluster." };
  const amountMinor = parseAmount(formData.get("amount"));
  if (amountMinor === null || amountMinor <= 0n) return { error: "Enter a withdrawal amount in USDC." };
  const built = await planWithdraw({ ...resolved.ctx, controllerTokenAccount: tokenAccount }, amountMinor);
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.controller });
}

/** Customer: stop future renewals. Paid-through access remains; balance stays withdrawable. */
export async function prepareRevoke(formData: FormData): Promise<PreparedPlan> {
  const vaultId = String(formData.get("vaultId") ?? "");
  const resolved = await resolveVault(formData, vaultId);
  if (!resolved.ok) return { error: resolved.error };
  const built = await planRevokeMandate(resolved.ctx);
  return plan({ instructions: built.instructions, preview: built.preview, feePayer: resolved.ctx.controller });
}

/** Resolve a stored vault into a plan context, checking the caller controls it. */
async function resolveVault(
  formData: FormData,
  vaultId: string,
): Promise<{ ok: true; ctx: BillingPlanContext } | { ok: false; error: string }> {
  const guarded = await guard(formData, String(formData.get("entityId") ?? ""));
  if (!guarded.ok) return guarded;
  const [row] = await getDb().select().from(billingVaults).where(eq(billingVaults.id, vaultId)).limit(1);
  if (!row || row.organizationId !== guarded.organizationId) return { ok: false, error: "That billing vault is not in this organization." };
  const controller = String(formData.get("controller") ?? "").trim();
  if (controller !== row.controllerAddress) return { ok: false, error: "Connect the wallet that controls this vault." };
  return {
    ok: true,
    ctx: {
      deployment: guarded.deployment,
      merchant: row.merchantAddress,
      controller: row.controllerAddress,
      controllerTokenAccount: "",
    },
  };
}

/** Require that the connected address is an active binding for the entity. */
async function requireBinding(
  organizationId: string,
  entityId: string,
  address: string,
  cluster: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!address) return { ok: false, error: "Connect the wallet that will control this vault." };
  const bindings = await listActiveWalletBindings(organizationId);
  const match = bindings.some(
    (binding) => binding.entityId === entityId && binding.walletAddress === address && binding.cluster === cluster,
  );
  return match ? { ok: true } : { ok: false, error: "Bind this wallet to the company first (Settings)." };
}

function parseAmount(value: FormDataEntryValue | null): bigint | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    return toMinor(text, USDC_DECIMALS);
  } catch {
    return null;
  }
}
