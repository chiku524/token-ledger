/**
 * Persistence for Service Balance projections: the vault, its mandate, and the
 * charges collected against it. Writes happen only after a finalized slot is
 * observed (the indexer, #162); a `pending` vault is one the app has prepared
 * but not yet seen settled on-chain.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, billingCharges, billingVaults, mandates } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export interface BillingVaultView {
  id: string;
  entityId: string;
  vaultAddress: string;
  controllerAddress: string;
  finalization: "pending" | "finalized" | "failed";
}

/** Active billing vaults for an organization. */
export async function listBillingVaults(organizationId: string): Promise<BillingVaultView[]> {
  const db = getDb();
  const rows = await db.select().from(billingVaults).where(eq(billingVaults.organizationId, organizationId));
  return rows.map((row) => ({
    id: row.id,
    entityId: row.entityId,
    vaultAddress: row.vaultAddress,
    controllerAddress: row.controllerAddress,
    finalization: row.finalization,
  }));
}

/**
 * Record a vault the customer has just created on-chain. Idempotent by
 * (deployment, vault address), so an indexer replay updates rather than inserts.
 */
export async function upsertBillingVault(
  input: {
    organizationId: string;
    entityId: string;
    chainDeploymentId: string;
    merchantAddress: string;
    vaultAddress: string;
    vaultAuthority: string;
    vaultTokenAccount: string;
    controllerAddress: string;
    mint: string;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: billingVaults.id })
      .from(billingVaults)
      .where(
        and(
          eq(billingVaults.chainDeploymentId, input.chainDeploymentId),
          eq(billingVaults.vaultAddress, input.vaultAddress),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
    const id = newId("vault");
    await tx.insert(billingVaults).values({ id, ...input, finalization: "finalized" });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor,
      action: "billing.vault.created",
      subjectType: "billing_vault",
      subjectId: id,
      detail: input.vaultAddress,
    });
  });
}

/** The mandate for a vault, when one has been signed. */
export async function mandateForVault(billingVaultId: string) {
  const db = getDb();
  const [row] = await db.select().from(mandates).where(eq(mandates.billingVaultId, billingVaultId)).limit(1);
  return row ?? null;
}

/** A mandate projection, for the Billing page and entitlement derivation. */
export interface MandateView {
  id: string;
  billingVaultId: string;
  entityId: string;
  mandateAddress: string;
  planAddress: string;
  planId: string;
  planVersion: number;
  priceMinor: bigint;
  periodSeconds: number;
  maxTotalDebitMinor: bigint;
  totalDebitedMinor: bigint;
  authorizationExpiry: Date;
  paidThrough: Date;
  nextCycle: bigint;
  generation: bigint;
  revoked: boolean;
  finalization: "pending" | "finalized" | "failed";
}

/** The mandate for a vault, or null. Same as `mandateForVault`, typed for display. */
export async function mandateViewForVault(billingVaultId: string): Promise<MandateView | null> {
  const row = await mandateForVault(billingVaultId);
  if (!row) return null;
  return {
    id: row.id,
    billingVaultId: row.billingVaultId,
    entityId: row.entityId,
    mandateAddress: row.mandateAddress,
    planAddress: row.planAddress,
    planId: row.planId,
    planVersion: row.planVersion,
    priceMinor: row.priceMinor,
    periodSeconds: row.periodSeconds,
    maxTotalDebitMinor: row.maxTotalDebitMinor,
    totalDebitedMinor: row.totalDebitedMinor,
    authorizationExpiry: row.authorizationExpiry,
    paidThrough: row.paidThrough,
    nextCycle: row.nextCycle,
    generation: row.generation,
    revoked: row.revoked,
    finalization: row.finalization,
  };
}

/** A collected charge (a receipt line). */
export interface ChargeView {
  id: string;
  mandateId: string;
  cycle: bigint;
  amountMinor: bigint;
  receiptAddress: string;
  coverageStart: Date;
  coverageEnd: Date;
  collectedAt: Date;
}

/** Charges collected against a mandate, newest cycle first. */
export async function listChargesForMandate(mandateId: string): Promise<ChargeView[]> {
  const db = getDb();
  const rows = await db.select().from(billingCharges).where(eq(billingCharges.mandateId, mandateId));
  return rows
    .map((row) => ({
      id: row.id,
      mandateId: row.mandateId,
      cycle: row.cycle,
      amountMinor: row.amountMinor,
      receiptAddress: row.receiptAddress,
      coverageStart: row.coverageStart,
      coverageEnd: row.coverageEnd,
      collectedAt: row.collectedAt,
    }))
    .sort((a, b) => (a.cycle > b.cycle ? -1 : a.cycle < b.cycle ? 1 : 0));
}
