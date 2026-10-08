/**
 * Persistence for the mandate → entitlement projection. Idempotent by mandate
 * and generation: re-running the projection for the same on-chain state updates
 * the row rather than inserting a second one, so a retry or a reorg replay
 * cannot double-apply an entitlement.
 */
import { and, eq } from "drizzle-orm";
import {
  deriveEntitlement,
  entitlementKey,
  hasAccess,
  type Entitlement,
  type MandateState,
} from "@/billing/entitlement";
import { resolveAccess, type OrganizationAccess } from "@/billing/access";
import { getDb } from "./client";
import { contractEntitlements, mandates } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export interface EntitlementInput {
  organizationId: string;
  entityId: string;
  mandateId: string;
  state: MandateState;
}

/** Project a mandate's state into an entitlement, idempotently. */
export async function projectEntitlement(input: EntitlementInput, now: Date = new Date()): Promise<Entitlement> {
  const entitlement = deriveEntitlement(input.state, now);
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: contractEntitlements.id })
      .from(contractEntitlements)
      .where(
        and(
          eq(contractEntitlements.mandateId, input.mandateId),
          eq(contractEntitlements.generation, input.state.generation),
        ),
      )
      .limit(1);
    const row = {
      organizationId: input.organizationId,
      entityId: input.entityId,
      mandateId: input.mandateId,
      generation: input.state.generation,
      renewing: entitlement.renewing,
      accessUntil: entitlement.accessUntil,
      capRemainingMinor: entitlement.capRemainingMinor,
      reason: entitlement.reason,
      asOf: entitlement.asOf,
    };
    if (existing.length > 0) {
      await tx.update(contractEntitlements).set(row).where(eq(contractEntitlements.id, existing[0]!.id));
    } else {
      await tx.insert(contractEntitlements).values({ id: newId("ent"), ...row });
    }
  });
  return entitlement;
}

/** The current entitlement for a mandate, if one has been projected. */
export async function currentEntitlement(mandateId: string): Promise<Entitlement | null> {
  const db = getDb();
  const rows = await db.select().from(contractEntitlements).where(eq(contractEntitlements.mandateId, mandateId));
  if (rows.length === 0) return null;
  // The highest generation is current; older generations are historical.
  const current = rows.reduce((latest, row) => (row.generation > latest.generation ? row : latest));
  return {
    renewing: current.renewing,
    accessUntil: current.accessUntil,
    capRemainingMinor: current.capRemainingMinor,
    generation: current.generation,
    asOf: current.asOf,
    reason: current.reason as Entitlement["reason"],
  };
}

/** Whether an organization's entity has contract access at `now`. */
export async function entityHasContractAccess(mandateId: string, now: Date = new Date()): Promise<boolean> {
  const entitlement = await currentEntitlement(mandateId);
  return entitlement ? hasAccess(entitlement, now) : false;
}

/**
 * Every current entitlement for an organization (one per mandate, highest
 * generation). `resolveAccess` turns these into the organization's access.
 */
export async function organizationEntitlements(organizationId: string): Promise<Entitlement[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contractEntitlements)
    .where(eq(contractEntitlements.organizationId, organizationId));
  const byMandate = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = byMandate.get(row.mandateId);
    if (!current || row.generation > current.generation) byMandate.set(row.mandateId, row);
  }
  return [...byMandate.values()].map((row) => ({
    renewing: row.renewing,
    accessUntil: row.accessUntil,
    capRemainingMinor: row.capRemainingMinor,
    generation: row.generation,
    asOf: row.asOf,
    reason: row.reason as Entitlement["reason"],
  }));
}

/** The organization's subscription access at `now`, from projected state. */
export async function organizationAccess(organizationId: string, now: Date = new Date()): Promise<OrganizationAccess> {
  const entitlements = await organizationEntitlements(organizationId);
  return resolveAccess(entitlements, now);
}

export { entitlementKey };

/** Build the projection input from a stored mandate row. */
export async function mandateStateFor(billingVaultId: string): Promise<{ mandateId: string; state: MandateState } | null> {
  const db = getDb();
  const [row] = await db.select().from(mandates).where(eq(mandates.billingVaultId, billingVaultId)).limit(1);
  if (!row) return null;
  return {
    mandateId: row.id,
    state: {
      finalization: row.finalization,
      revoked: row.revoked,
      authorizationExpiry: row.authorizationExpiry,
      paidThrough: row.paidThrough,
      totalDebitedMinor: row.totalDebitedMinor,
      maxTotalDebitMinor: row.maxTotalDebitMinor,
      generation: row.generation,
    },
  };
}

/**
 * Project the entitlement for a vault's mandate from its stored (finalized)
 * projection. This is the call site the indexer uses after a mandate finalizes;
 * it is idempotent, so a reorg replay is safe. Returns null when the vault has no
 * mandate yet.
 */
export async function projectEntitlementForVault(
  organizationId: string,
  entityId: string,
  billingVaultId: string,
  now: Date = new Date(),
): Promise<Entitlement | null> {
  const stored = await mandateStateFor(billingVaultId);
  if (!stored) return null;
  return projectEntitlement({ organizationId, entityId, mandateId: stored.mandateId, state: stored.state }, now);
}
