"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { actorName, assertCsrf, AuthError, requirePermission } from "@/auth/current";
import { canAccessEntity } from "@/auth/roles";
import {
  assessChallenge,
  buildOwnershipMessage,
  CHALLENGE_TTL_MS,
  isOwnershipChain,
  normalizeAddress,
  normalizeDomain,
  verifyOwnershipSignature,
} from "@/auth/wallet-ownership";
import { canWriteBooks } from "@/data/authorized-books";
import { connectionReturnPath } from "@/data/connection-return";
import { verifiedWalletDraft } from "@/data/connections";
import { loadBooks } from "@/data/load-books";
import { getDb } from "@/db/client";
import { ownershipChallenges } from "@/db/schema";
import { BooksWriteError, insertConnection } from "@/db/write";
import { fail, finish, save } from "./form-state";

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";

export type IssuedChallenge = { challengeId: string; message: string } | { error: string };

export async function issueOwnershipChallenge(formData: FormData): Promise<IssuedChallenge> {
  try {
    await assertCsrf(formData);
    const session = await requirePermission("source.write");
    if (!canWriteBooks(session)) return { error: READ_ONLY };
    const entityId = String(formData.get("entityId") ?? "");
    const chainRaw = String(formData.get("chain") ?? "");
    const addressRaw = String(formData.get("address") ?? "");
    if (!isOwnershipChain(chainRaw)) return { error: "Choose Ethereum, Solana, or Polygon." };
    const address = normalizeAddress(chainRaw, addressRaw);
    if (!address) return { error: "That address does not match the network." };
    if (!canAccessEntity(session, entityId)) return { error: "That company is outside your access." };
    const domain = await requestDomain();
    if (!domain) return { error: "This site could not be confirmed." };
    const books = await loadBooks(session.organizationId);
    if (!books.entities.some((entity) => entity.id === entityId)) return { error: "Choose a company in this organization." };

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const nonce = randomBytes(16).toString("hex");
    const message = buildOwnershipMessage({
      domain,
      organizationId: session.organizationId,
      chain: chainRaw,
      address,
      nonce,
      expiresAt,
    });
    const challengeId = `own_${randomBytes(8).toString("hex")}`;
    await getDb().insert(ownershipChallenges).values({
      id: challengeId,
      organizationId: session.organizationId,
      sessionId: session.id,
      entityId,
      chain: chainRaw,
      address,
      domain,
      nonce,
      message,
      expiresAt,
    });
    return { challengeId, message };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    return { error: "Could not start verification." };
  }
}

export async function verifyWalletOwnershipAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  try {
    await assertCsrf(formData);
    const session = await requirePermission("source.write");
    if (!canWriteBooks(session)) fail(path, READ_ONLY);
    const challengeId = String(formData.get("challengeId") ?? "");
    const signature = String(formData.get("signature") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "");
    if (!name || name.length > 200) fail(path, "Name the wallet.");
    if (role !== "hot" && role !== "cold" && role !== "staking") fail(path, "Choose hot, cold, or staking.");
    if (!signature) fail(path, "The wallet did not sign.");

    const domain = await requestDomain();
    if (!domain) fail(path, "This site could not be confirmed.");
    const books = await loadBooks(session.organizationId);
    const [challenge] = await getDb()
      .select()
      .from(ownershipChallenges)
      .where(and(eq(ownershipChallenges.id, challengeId), eq(ownershipChallenges.organizationId, session.organizationId)))
      .limit(1);
    if (!challenge) fail(path, "Start verification again.");
    if (!isOwnershipChain(challenge.chain)) fail(path, "Start verification again.");
    const chain = challenge.chain;
    if (!canAccessEntity(session, challenge.entityId)) fail(path, "That company is outside your access.");
    const rejection = assessChallenge(
      {
        organizationId: challenge.organizationId,
        sessionId: challenge.sessionId,
        chain,
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
        chain,
        address: challenge.address,
        domain,
      },
    );
    if (rejection) fail(path, rejection);
    const valid = await verifyOwnershipSignature(chain, challenge.address, challenge.message, signature);
    if (!valid) fail(path, "The signature does not match this address.");

    await save(path, () =>
      insertConnection(
        books,
        verifiedWalletDraft({
          entityId: challenge.entityId,
          chain,
          name,
          role,
          address: challenge.address,
          signature,
          verifiedAt: new Date(),
        }),
        actorName(session),
        undefined,
        challenge.id,
      ),
    );
  } catch (error) {
    if (error instanceof AuthError || error instanceof BooksWriteError) fail(path, error.message);
    throw error;
  }
  finish(path, "Wallet verified. The connection is read-only, and no key was stored.");
}

async function requestDomain(): Promise<string | null> {
  const headerList = await headers();
  const raw = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return normalizeDomain(raw?.split(",")[0]);
}
