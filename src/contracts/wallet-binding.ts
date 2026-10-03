/**
 * Binding a Solana wallet to a user and entity for contract actions.
 *
 * A binding is a proof that the signed-in user controls an address on a given
 * cluster, for a given organization and entity, on this domain. It is not a
 * signing key: the app never stores one. The challenge is one-use and expiring,
 * bound to the session, organization, entity, domain and cluster, so a signed
 * message cannot be replayed on another site, cluster, or account.
 *
 * The read-only product already verifies wallet control for connections
 * (`src/auth/wallet-ownership.ts`). This is the financial counterpart: the same
 * signature primitives with a message that names the cluster and the contract
 * intent, and a durable, auditable binding row (`wallet_bindings`).
 */
import { normalizeAddress } from "@/auth/wallet-ownership";
import type { SolanaCluster } from "@/config/solana";

export const BINDING_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface BindingChallengeInput {
  domain: string;
  organizationId: string;
  entityId: string;
  cluster: SolanaCluster;
  address: string;
  nonce: string;
  expiresAt: Date;
}

/**
 * The exact text a wallet signs to bind for contract actions. It names the
 * cluster and entity, and states plainly that it authorizes nothing by itself —
 * a binding proves control, it does not move funds.
 */
export function buildBindingMessage(input: BindingChallengeInput): string {
  return [
    "Token Ledger wallet binding",
    `Domain: ${input.domain}`,
    `Organization: ${input.organizationId}`,
    `Entity: ${input.entityId}`,
    `Cluster: ${input.cluster}`,
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "This signature binds this wallet to this account for contract actions.",
    "It authorizes no transfer. Every payment needs a separate signature.",
  ].join("\n");
}

export interface BindingChallengeRecord {
  organizationId: string;
  sessionId: string;
  entityId: string;
  cluster: SolanaCluster;
  address: string;
  domain: string;
  message: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface BindingAttempt {
  organizationId: string;
  sessionId: string;
  entityId: string;
  cluster: SolanaCluster;
  address: string;
  domain: string;
}

/**
 * Null when the challenge can still be used. Otherwise the reason to show the
 * user. The cluster and entity are checked here as well as the shared fields.
 */
export function assessBindingChallenge(
  record: BindingChallengeRecord,
  now: Date,
  attempt: BindingAttempt,
): string | null {
  if (record.consumedAt) return "This verification was already used.";
  if (record.expiresAt.getTime() <= now.getTime()) return "This verification expired. Start again.";
  if (record.organizationId !== attempt.organizationId) return "This verification is for a different organization.";
  if (record.sessionId !== attempt.sessionId) return "This verification is for a different sign-in.";
  if (record.entityId !== attempt.entityId) return "This verification is for a different company.";
  if (record.cluster !== attempt.cluster) return "This verification is for a different cluster.";
  if (record.domain !== attempt.domain) return "This verification is for a different site.";
  if (record.address !== attempt.address) return "This verification is for a different address.";
  return null;
}

/** Normalize a Solana address the same way the ownership flow does. */
export function normalizeBindingAddress(address: string): string | null {
  return normalizeAddress("solana", address);
}
