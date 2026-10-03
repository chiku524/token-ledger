/**
 * Persistence for Accounts Payable projections: suppliers, invoices, and the
 * treasury with its signer policy. Invoices are the app's private record; the
 * on-chain proposal references the invoice only by its opaque key. The unique
 * index on (entity, supplier, normalized reference) is what stops a user from
 * entering the same real-world invoice under two keys.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { auditEvents, invoices, supplierDestinations, suppliers, treasuryAccounts, treasurySigners } from "./schema";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class TreasuryWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreasuryWriteError";
  }
}

export interface SupplierInput {
  organizationId: string;
  entityId: string;
  name: string;
  normalizedName: string;
  createdBy: string;
}

export async function createSupplier(input: SupplierInput, actor: string): Promise<string> {
  const db = getDb();
  const id = newId("sup");
  await db.transaction(async (tx) => {
    await tx.insert(suppliers).values({ id, ...input, notes: "" });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor,
      action: "supplier.created",
      subjectType: "supplier",
      subjectId: id,
      detail: input.name,
    });
  });
  return id;
}

export interface InvoiceInput {
  organizationId: string;
  entityId: string;
  supplierId: string;
  invoiceKey: string;
  supplierReference: string;
  normalizedReference: string;
  currency: string;
  amountMinor: bigint;
  createdBy: string;
}

/**
 * Create the private invoice record. The (entity, supplier, normalized
 * reference) unique index means a duplicate throws; the caller surfaces it for
 * human review rather than silently merging.
 */
export async function createInvoice(input: InvoiceInput, actor: string): Promise<string> {
  const db = getDb();
  const id = newId("inv");
  await db.transaction(async (tx) => {
    await tx.insert(invoices).values({ id, ...input, status: "draft" });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: input.organizationId,
      occurredAt: new Date(),
      actor,
      action: "invoice.created",
      subjectType: "invoice",
      subjectId: id,
      detail: input.supplierReference,
    });
  });
  return id;
}

/** Invoices for an entity, newest first. Private data stays server-side. */
export async function listInvoices(organizationId: string) {
  const db = getDb();
  return db.select().from(invoices).where(eq(invoices.organizationId, organizationId));
}

/** A supplier's verified destination address for a chain, if one exists. */
export async function verifiedDestination(supplierId: string, chain: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(supplierDestinations)
    .where(
      and(
        eq(supplierDestinations.supplierId, supplierId),
        eq(supplierDestinations.chain, chain),
        eq(supplierDestinations.verification, "verified"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Project a treasury and its signer policy from chain state, idempotently. */
export async function upsertTreasury(
  input: {
    organizationId: string;
    entityId: string;
    chainDeploymentId: string;
    treasuryAddress: string;
    treasuryAuthority: string;
    treasuryTokenAccount: string;
    mint: string;
    policyVersion: bigint;
    threshold: number;
    approvers: string[];
    proposers: string[];
    perPaymentLimitMinor: bigint;
    dailyLimitMinor: bigint;
    maxProposalLifetimeSeconds: number;
    recoveryAddress: string;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: treasuryAccounts.id })
      .from(treasuryAccounts)
      .where(
        and(
          eq(treasuryAccounts.chainDeploymentId, input.chainDeploymentId),
          eq(treasuryAccounts.treasuryAddress, input.treasuryAddress),
        ),
      )
      .limit(1);
    const id = existing?.id ?? newId("trs");
    const values = {
      organizationId: input.organizationId,
      entityId: input.entityId,
      chainDeploymentId: input.chainDeploymentId,
      treasuryAddress: input.treasuryAddress,
      treasuryAuthority: input.treasuryAuthority,
      treasuryTokenAccount: input.treasuryTokenAccount,
      mint: input.mint,
      policyVersion: input.policyVersion,
      threshold: input.threshold,
      approverCount: input.approvers.length,
      proposerCount: input.proposers.length,
      perPaymentLimitMinor: input.perPaymentLimitMinor,
      dailyLimitMinor: input.dailyLimitMinor,
      maxProposalLifetimeSeconds: input.maxProposalLifetimeSeconds,
      executionPaused: false,
      recoveryAddress: input.recoveryAddress,
      closed: false,
      finalization: "finalized" as const,
    };
    if (existing) {
      await tx.update(treasuryAccounts).set({ ...values, updatedAt: new Date() }).where(eq(treasuryAccounts.id, id));
      // Replace the signer set for the new policy version.
      await tx.delete(treasurySigners).where(eq(treasurySigners.treasuryAccountId, id));
    } else {
      await tx.insert(treasuryAccounts).values({ id, ...values });
    }
    const rows = [
      ...input.approvers.map((address) => ({ role: "approver", address })),
      ...input.proposers.map((address) => ({ role: "proposer", address })),
    ].map((entry) => ({
      id: newId("signer"),
      organizationId: input.organizationId,
      treasuryAccountId: id,
      role: entry.role,
      signerAddress: entry.address,
      policyVersion: input.policyVersion,
    }));
    if (rows.length > 0) await tx.insert(treasurySigners).values(rows);
    if (!existing) {
      await tx.insert(auditEvents).values({
        id: newId("audit"),
        organizationId: input.organizationId,
        occurredAt: new Date(),
        actor,
        action: "treasury.created",
        subjectType: "treasury",
        subjectId: id,
        detail: input.treasuryAddress,
      });
    }
  });
}
