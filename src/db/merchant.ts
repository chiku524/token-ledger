/**
 * Persistence for the Service Balance platform merchant config.
 *
 * Per the plan, Token Ledger is the merchant: customers subscribe to it and pay
 * it, so there is exactly **one** merchant per cluster, shared by every
 * organization. It is not observed from chain events — it is created once by the
 * operator and then read to resolve the merchant PDA. The admin's address seeds
 * the merchant PDA, so storing the admin is enough to derive the merchant.
 *
 * The audit row is recorded against the acting operator's organization, which is
 * the only organization context available at initialization time.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, merchantConfigs } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export interface MerchantView {
  id: string;
  cluster: string;
  adminAddress: string;
  merchantAddress: string;
  collectorAddress: string;
  mint: string;
  destination: string;
}

/** The platform merchant config for a cluster, if one was initialized. */
export async function findPlatformMerchant(cluster: string): Promise<MerchantView | null> {
  const db = getDb();
  const [row] = await db.select().from(merchantConfigs).where(eq(merchantConfigs.cluster, cluster)).limit(1);
  return row ? toView(row) : null;
}

/** Record the platform merchant the operator is about to create. Idempotent by cluster. */
export async function upsertPlatformMerchant(
  input: {
    actorOrganizationId: string;
    cluster: string;
    adminAddress: string;
    merchantAddress: string;
    collectorAddress: string;
    mint: string;
    destination: string;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: merchantConfigs.id })
      .from(merchantConfigs)
      .where(eq(merchantConfigs.cluster, input.cluster))
      .limit(1);
    if (existing) {
      await tx
        .update(merchantConfigs)
        .set({
          adminAddress: input.adminAddress,
          merchantAddress: input.merchantAddress,
          collectorAddress: input.collectorAddress,
          mint: input.mint,
          destination: input.destination,
        })
        .where(eq(merchantConfigs.id, existing.id));
      return;
    }
    const id = newId("merchant");
    await tx.insert(merchantConfigs).values({
      id,
      cluster: input.cluster,
      adminAddress: input.adminAddress,
      merchantAddress: input.merchantAddress,
      collectorAddress: input.collectorAddress,
      mint: input.mint,
      destination: input.destination,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.actorOrganizationId,
      occurredAt: new Date(),
      actor,
      action: "billing.merchant.initialized",
      subjectType: "merchant_config",
      subjectId: id,
      detail: `${input.merchantAddress} (admin ${input.adminAddress})`,
    });
  });
}

function toView(row: {
  id: string;
  cluster: string;
  adminAddress: string;
  merchantAddress: string;
  collectorAddress: string;
  mint: string;
  destination: string;
}): MerchantView {
  return {
    id: row.id,
    cluster: row.cluster,
    adminAddress: row.adminAddress,
    merchantAddress: row.merchantAddress,
    collectorAddress: row.collectorAddress,
    mint: row.mint,
    destination: row.destination,
  };
}
