import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { getAddress, isAddress, verifyMessage } from "viem";

/** Networks a wallet connection can prove or watch. Polygon uses the same signature as Ethereum. */
export const OWNERSHIP_CHAINS = ["ethereum", "solana", "polygon"] as const;
export type OwnershipChain = (typeof OWNERSHIP_CHAINS)[number];

export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface OwnershipChallengeInput {
  domain: string;
  organizationId: string;
  chain: OwnershipChain;
  address: string;
  nonce: string;
  expiresAt: Date;
}

export interface ChallengeRecord {
  organizationId: string;
  sessionId: string;
  chain: OwnershipChain;
  address: string;
  domain: string;
  message: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface ChallengeBinding {
  organizationId: string;
  sessionId: string;
  chain: OwnershipChain;
  address: string;
  domain: string;
}

export function isOwnershipChain(value: string): value is OwnershipChain {
  return (OWNERSHIP_CHAINS as readonly string[]).includes(value);
}

/** Host the challenge is bound to. A different site cannot replay it. */
export function normalizeDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const domain = host.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || /[\s/]/.test(domain)) return null;
  return domain;
}

export function normalizeAddress(chain: OwnershipChain, address: string): string | null {
  const trimmed = address.trim();
  if (chain === "solana") {
    try {
      const bytes = base58.decode(trimmed);
      if (bytes.length !== 32) return null;
      return base58.encode(bytes);
    } catch {
      return null;
    }
  }
  if (!isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

export function buildOwnershipMessage(input: OwnershipChallengeInput): string {
  return [
    "Token Ledger ownership",
    `Domain: ${input.domain}`,
    `Organization: ${input.organizationId}`,
    `Chain: ${input.chain}`,
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "This signature proves control of the address. It does not authorize a transfer.",
  ].join("\n");
}

/** Null when the challenge can still be used. Otherwise a reason to show the user. */
export function assessChallenge(record: ChallengeRecord, now: Date, binding: ChallengeBinding): string | null {
  if (record.consumedAt) return "This verification was already used.";
  if (record.expiresAt.getTime() <= now.getTime()) return "This verification expired. Start again.";
  if (record.organizationId !== binding.organizationId) return "This verification is for a different organization.";
  if (record.sessionId !== binding.sessionId) return "This verification is for a different sign-in.";
  if (record.domain !== binding.domain) return "This verification is for a different site.";
  if (record.chain !== binding.chain) return "This verification is for a different network.";
  if (record.address !== binding.address) return "This verification is for a different address.";
  return null;
}

export async function verifyOwnershipSignature(
  chain: OwnershipChain,
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  if (chain === "solana") return verifySolana(address, message, signature);
  return verifyEvm(address, message, signature);
}

async function verifyEvm(address: string, message: string, signature: string): Promise<boolean> {
  if (!isAddress(address) || !isEvmSignature(signature)) return false;
  try {
    return await verifyMessage({
      address: getAddress(address),
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

function verifySolana(address: string, message: string, signature: string): boolean {
  try {
    const publicKey = base58.decode(address);
    const sig = decodeSignature(signature);
    if (publicKey.length !== 32 || sig.length !== 64) return false;
    return ed25519.verify(sig, new TextEncoder().encode(message), publicKey);
  } catch {
    return false;
  }
}

function isEvmSignature(signature: string): signature is `0x${string}` {
  return /^0x[0-9a-fA-F]{130}$/.test(signature);
}

function decodeSignature(signature: string): Uint8Array {
  if (signature.startsWith("0x")) return hexToBytes(signature.slice(2));
  return base58.decode(signature);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) throw new Error("Invalid signature.");
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
