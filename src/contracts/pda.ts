/**
 * Program-derived addresses for the Token Ledger contracts, and the seed
 * drivers the app passes to the builder. The seeds mirror `contracts/programs/shared`
 * (`seeds::*`) and the account contexts; a mismatch would derive a different
 * address, so they are kept beside this comment and covered by tests that use
 * the real program's PDAs as vectors.
 *
 * `findProgramAddress` uses the standard Solana rule: hash the concatenated
 * seeds, the bump byte, the program id and the marker `ProgramDerivedAddress`,
 * and accept the first result that is not a valid ed25519 point. SHA-256 and the
 * curve check use Web Crypto and the curve library already in the project, so
 * this runs on Node and Workers alike. The seed/bump/program order and strict
 * (non-ZIP215) decompression are both required to match the runtime; tests pin
 * the derivation against addresses from `@solana/web3.js`.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { decodeBase58 } from "@/adapters/sources/solana/address";

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

export interface Pda {
  address: string;
  bump: number;
}

/** UTF-8 bytes of a seed prefix, e.g. `seed("merchant")`. */
export function seed(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** A public key as seed bytes. Throws on a non-address. */
export function pubkeySeed(address: string): Uint8Array {
  const bytes = decodeBase58(address);
  if (bytes.length !== 32) throw new Error(`"${address}" is not a Solana address.`);
  return bytes;
}

/** A bigint as 8 little-endian bytes. */
export function u64Seed(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("A u64 seed cannot be negative.");
  const out = new Uint8Array(8);
  let rest = value;
  for (let index = 0; index < 8; index += 1) {
    out[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** A u32 as 4 little-endian bytes. */
export function u32Seed(value: number): Uint8Array {
  if (value < 0 || !Number.isInteger(value)) throw new Error("A u32 seed must be a non-negative integer.");
  const out = new Uint8Array(4);
  let rest = value;
  for (let index = 0; index < 4; index += 1) {
    out[index] = rest & 0xff;
    rest >>>= 8;
  }
  return out;
}

/**
 * Derive a program address. Async because SHA-256 is via Web Crypto. Throws
 * when no bump produces an off-curve address, which cannot happen for valid
 * seeds but is checked rather than assumed.
 */
export async function findProgramAddress(seeds: Uint8Array[], programId: string): Promise<Pda> {
  const program = pubkeySeed(programId);
  for (let bump = 255; bump >= 0; bump -= 1) {
    // The bump precedes the program id: `seeds || bump || programId || marker`.
    const hash = await sha256(concat([...seeds, Uint8Array.of(bump), program, PDA_MARKER]));
    if (isOffCurve(hash)) return { address: base58.encode(hash), bump };
  }
  throw new Error("Could not find a viable program address.");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

/**
 * A PDA is a hash that is not a valid ed25519 point. Solana uses strict
 * decompression (RFC 8032), not ZIP-215, so `fromBytes` must be called with
 * `zip215: false`; the default would accept extra points and pick a different
 * bump than the runtime. Asserted against the real program's PDAs in tests.
 */
function isOffCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes, false);
    return false;
  } catch {
    return true;
  }
}

// --- Seed drivers, mirroring contracts/programs/shared/src/lib.rs ----------------

export const seedMerchant = (admin: string) => [seed("merchant"), pubkeySeed(admin)];

export const seedPlanVersion = (merchant: string, planId: Uint8Array, version: number) => [
  seed("plan_version"),
  pubkeySeed(merchant),
  planId,
  new Uint8Array([version & 0xff, (version >> 8) & 0xff]),
];

export const seedBillingVault = (merchant: string, controller: string) => [
  seed("billing_vault"),
  pubkeySeed(merchant),
  pubkeySeed(controller),
];

export const seedBillingVaultToken = (vault: string) => [seed("billing_vault_token"), pubkeySeed(vault)];

export const seedMandate = (vault: string) => [seed("mandate"), pubkeySeed(vault)];

export const seedChargeReceipt = (mandate: string, cycle: bigint) => [
  seed("charge_receipt"),
  pubkeySeed(mandate),
  u64Seed(cycle),
];

export const seedTreasuryConfig = (entity: string) => [seed("treasury_config"), pubkeySeed(entity)];

export const seedTreasuryAuthority = (treasury: string) => [seed("treasury_authority"), pubkeySeed(treasury)];

export const seedTreasuryToken = (treasury: string) => [seed("treasury_token"), pubkeySeed(treasury)];

export const seedPaymentProposal = (treasury: string, invoiceKey: Uint8Array, revision: number) => [
  seed("payment_proposal"),
  pubkeySeed(treasury),
  invoiceKey,
  u32Seed(revision),
];

export const seedInvoiceSettlement = (treasury: string, invoiceKey: Uint8Array) => [
  seed("invoice_settlement"),
  pubkeySeed(treasury),
  invoiceKey,
];

export const seedDailySpend = (treasury: string) => [seed("daily_spend"), pubkeySeed(treasury)];

export const seedGovernanceProposal = (treasury: string, policyVersion: bigint, kind: number) => [
  seed("governance_proposal"),
  pubkeySeed(treasury),
  u64Seed(policyVersion),
  Uint8Array.of(kind),
];

/** A 32-byte invoice key from a hex string. */
export function invoiceKeyFromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64 || !/^[0-9a-fA-F]+$/.test(clean)) throw new Error("An invoice key is 32 hex-encoded bytes.");
  const out = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  return out;
}
