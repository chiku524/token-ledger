/**
 * Persistence for the Service Balance merchant config.
 *
 * Unlike a vault or mandate, the merchant config is not observed from chain
 * events — it is created once by the merchant admin and then read by the billing
 * actions to resolve the merchant PDA. So this is a plain record: one merchant
 * per (organization, cluster). It is written when the admin asks to initialize
 * one; the on-chain `initialize_merchant` is idempotent by the PDA, so a retry
 * never creates a second config.
 *
 * The admin's own address seeds the merchant PDA, so storing the admin is enough
 * to derive the merchant; the derived address is stored too, for display.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, merchantConfigs } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export interface MerchantView {
  id: string;
  entityId: string;
  cluster: string;
  adminAddress: string;
  merchantAddress: string;
  collectorAddress: string;
  mint: string;
  destination: string;
}

/** The merchant config for an organization and cluster, if one was initialized. */
export async function findMerchantForCluster(organizationId: string, cluster: string): Promise<MerchantView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(merchantConfigs)
    .where(and(eq(merchantConfigs.organizationId, organizationId), eq(merchantConfigs.cluster, cluster)))
    .limit(1);
  return row ? toView(row) : null;
}

/** Record the merchant config the admin is about to create. Idempotent by (org, cluster). */
export async function upsertMerchant(
  input: {
    organizationId: string;
    entityId: string;
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
      .where(and(eq(merchantConfigs.organizationId, input.organizationId), eq(merchantConfigs.cluster, input.cluster)))
      .limit(1);
    if (existing) {
      await tx
        .update(merchantConfigs)
        .set({
          entityId: input.entityId,
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
    await tx.insert(merchantConfigs).values({ id, ...input });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
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
  entityId: string;
  cluster: string;
  adminAddress: string;
  merchantAddress: string;
  collectorAddress: string;
  mint: string;
  destination: string;
}): MerchantView {
  return {
    id: row.id,
    entityId: row.entityId,
    cluster: row.cluster,
    adminAddress: row.adminAddress,
    merchantAddress: row.merchantAddress,
    collectorAddress: row.collectorAddress,
    mint: row.mint,
    destination: row.destination,
  };
}
