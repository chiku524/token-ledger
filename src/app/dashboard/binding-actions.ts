"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { actorName, assertCsrf, AuthError, requirePermission } from "@/auth/current";
import { canAccessEntity } from "@/auth/roles";
import { normalizeDomain, verifyOwnershipSignature } from "@/auth/wallet-ownership";
import { canWriteBooks } from "@/data/authorized-books";
import { loadBooks } from "@/data/load-books";
import { solanaDeployment } from "@/config/solana";
import {
  assessBindingChallenge,
  BINDING_CHALLENGE_TTL_MS,
  buildBindingMessage,
  normalizeBindingAddress,
} from "@/contracts/wallet-binding";
import { getDb } from "@/db/client";
import { bindingChallenges } from "@/db/schema";
import { insertWalletBinding, WalletBindingError } from "@/db/wallet-bindings";
import { fail, save } from "./form-state";

export type IssuedBindingChallenge = { challengeId: string; message: string } | { error: string };

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";

/** Ask the user's wallet to sign a message binding it to an entity for contract actions. */
export async function issueBindingChallenge(formData: FormData): Promise<IssuedBindingChallenge> {
  try {
    await assertCsrf(formData);
    const session = await requirePermission("source.write");
    if (!canWriteBooks(session)) return { error: READ_ONLY };
    const deployment = solanaDeployment();
    if (!deployment) return { error: "The contract features are not configured on this deployment." };

    const entityId = String(formData.get("entityId") ?? "");
    const address = normalizeBindingAddress(String(formData.get("address") ?? ""));
    if (!address) return { error: "That address is not a Solana address." };
    if (!canAccessEntity(session, entityId)) return { error: "That company is outside your access." };
    const domain = await requestDomain();
    if (!domain) return { error: "This site could not be confirmed." };
    const books = await loadBooks(session.organizationId);
    if (!books.entities.some((entity) => entity.id === entityId)) return { error: "Choose a company in this organization." };

    const expiresAt = new Date(Date.now() + BINDING_CHALLENGE_TTL_MS);
    const nonce = randomBytes(16).toString("hex");
    const message = buildBindingMessage({
      domain,
      organizationId: session.organizationId,
      entityId,
      cluster: deployment.cluster,
      address,
      nonce,
      expiresAt,
    });
    const challengeId = `bind_${randomBytes(8).toString("hex")}`;
    await getDb().insert(bindingChallenges).values({
      id: challengeId,
      organizationId: session.organizationId,
      userId: session.id,
      sessionId: session.id,
      entityId,
      cluster: deployment.cluster,
      address,
      domain,
      nonce,
      message,
      expiresAt,
    });
    return { challengeId, message };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    return { error: "Could not start wallet binding." };
  }
}

/** Verify the signed message and write the binding, consuming the challenge. */
export async function verifyWalletBindingAction(formData: FormData): Promise<void> {
  const path = String(formData.get("next") ?? "/dashboard/settings");
  try {
    await assertCsrf(formData);
    const session = await requirePermission("source.write");
    if (!canWriteBooks(session)) fail(path, READ_ONLY);
    const deployment = solanaDeployment();
    if (!deployment) fail(path, "The contract features are not configured on this deployment.");
    const challengeId = String(formData.get("challengeId") ?? "");
    const signature = String(formData.get("signature") ?? "").trim();
    if (!signature) fail(path, "The wallet did not sign.");

    const domain = await requestDomain();
    if (!domain) fail(path, "This site could not be confirmed.");
    const books = await loadBooks(session.organizationId);
    const [challenge] = await getDb()
      .select()
      .from(bindingChallenges)
      .where(
        and(
          eq(bindingChallenges.id, challengeId),
          eq(bindingChallenges.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!challenge) fail(path, "Start the binding again.");
    if (!canAccessEntity(session, challenge.entityId)) fail(path, "That company is outside your access.");

    const rejection = assessBindingChallenge(
      {
        organizationId: challenge.organizationId,
        sessionId: challenge.sessionId,
        entityId: challenge.entityId,
        cluster: challenge.cluster as typeof deployment.cluster,
        address: challenge.address,
        domain: challenge.domain,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
        consumedAt: challenge.consumedAt,
      },
      new Date(),
      {
        organizationId: session.organizationId,
        sessionId: session.id,
        entityId: challenge.entityId,
        cluster: deployment.cluster,
        address: challenge.address,
        domain,
      },
    );
    if (rejection) fail(path, rejection);

    const valid = await verifyOwnershipSignature("solana", challenge.address, challenge.message, signature);
    if (!valid) fail(path, "The signature does not match this address.");

    await save(path, () =>
      insertWalletBinding(
        books,
        {
          entityId: challenge.entityId,
          userId: session.id,
          challengeId: challenge.id,
          cluster: challenge.cluster,
          walletAddress: challenge.address,
        },
        actorName(session),
      ),
    );
  } catch (error) {
    if (error instanceof AuthError || error instanceof WalletBindingError) fail(path, error.message);
    throw error;
  }
}

async function requestDomain(): Promise<string | null> {
  const headerList = await headers();
  const raw = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return normalizeDomain(raw?.split(",")[0]);
}
