/**
 * Persistence for wallet bindings. A binding is written only after the
 * challenge is consumed and the signature is verified. The insert and the
 * challenge consumption share one transaction, so a consumed challenge always
 * has its binding and vice versa. Revocation is a timestamp, never a delete.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Books } from "@/data/books";
import { getDb } from "./client";
import { auditEvents, bindingChallenges, walletBindings } from "./schema";

export interface WalletBindingView {
  id: string;
  entityId: string;
  userId: string;
  cluster: string;
  walletAddress: string;
  verifiedAt: Date;
  revokedAt: Date | null;
}

/** Active (non-revoked) bindings for an organization, for display and checks. */
export async function listActiveWalletBindings(organizationId: string): Promise<WalletBindingView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(walletBindings)
    .where(and(eq(walletBindings.organizationId, organizationId), isNull(walletBindings.revokedAt)));
  return rows.map((row) => ({
    id: row.id,
    entityId: row.entityId,
    userId: row.userId,
    cluster: row.cluster,
    walletAddress: row.walletAddress,
    verifiedAt: row.verifiedAt,
    revokedAt: row.revokedAt,
  }));
}

export class WalletBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletBindingError";
  }
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Insert a verified binding, consuming `challengeId` atomically. The caller has
 * already checked the signature; this only guards uniqueness and the one-use
 * challenge.
 */
export async function insertWalletBinding(
  books: Books,
  input: {
    entityId: string;
    userId: string;
    challengeId: string;
    cluster: string;
    walletAddress: string;
  },
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(bindingChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(bindingChallenges.id, input.challengeId),
          eq(bindingChallenges.organizationId, books.organization.id),
          isNull(bindingChallenges.consumedAt),
        ),
      )
      .returning({ id: bindingChallenges.id });
    if (claimed.length === 0) throw new WalletBindingError("This verification was already used.");

    const id = newId("bind");
    await tx.insert(walletBindings).values({
      id,
      organizationId: books.organization.id,
      entityId: input.entityId,
      userId: input.userId,
      challengeId: input.challengeId,
      cluster: input.cluster,
      walletAddress: input.walletAddress,
      verifiedAt: new Date(),
      revokedAt: null,
    });
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: books.organization.id,
      occurredAt: new Date(),
      actor,
      action: "wallet.bound",
      subjectType: "wallet_binding",
      subjectId: id,
      detail: `${input.walletAddress} on ${input.cluster}`,
    });
  });
}

/** Revoke a binding. The row is kept for audit; a revoked binding is unusable. */
export async function revokeWalletBinding(
  books: Books,
  bindingId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(walletBindings)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(walletBindings.id, bindingId),
          eq(walletBindings.organizationId, books.organization.id),
          isNull(walletBindings.revokedAt),
        ),
      )
      .returning({ id: walletBindings.id });
    if (updated.length === 0) throw new WalletBindingError("That wallet binding is not active.");
    await tx.insert(auditEvents).values({
      id: newId("audit"),
      organizationId: books.organization.id,
      occurredAt: new Date(),
      actor,
      action: "wallet.revoked",
      subjectType: "wallet_binding",
      subjectId: bindingId,
      detail: "revoked",
    });
  });
}
