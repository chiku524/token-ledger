/**
 * Persistence for Service Balance projections: the vault, its mandate, and the
 * charges collected against it. Writes happen only after a finalized slot is
 * observed (the indexer, #162); a `pending` vault is one the app has prepared
 * but not yet seen settled on-chain.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, billingVaults, mandates } from "./schema";

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
