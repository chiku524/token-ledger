/**
 * Invoice identity and duplicate prevention. The chain stops the same invoice
 * key settling twice. It cannot know that two different keys are the same
 * real-world invoice, so the backend enforces normalized supplier + reference
 * uniqueness within an entity before a proposal is ever made.
 *
 * Pure and deterministic: the same invoice always normalizes to the same
 * reference, so a re-entry is caught.
 */
import { randomBytes } from "@/lib/webcrypto";

/**
 * Normalize an invoice reference for comparison: upper-case, trim, and collapse
 * internal whitespace and common separators. "INV-2026/0042" and "inv 2026 0042"
 * become the same key, so an accidental re-entry is detectable.
 */
export function normalizeReference(reference: string): string {
  return reference
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/.#]+/g, "");
}

export interface InvoiceIdentity {
  entityId: string;
  supplierId: string;
  /** Normalized supplier reference. */
  reference: string;
}

/**
 * Whether two identities look like the same real-world invoice. Used before a
 * proposal; a true result must be surfaced to a human, not silently merged.
 */
export function looksLikeDuplicate(a: InvoiceIdentity, b: InvoiceIdentity): boolean {
  return a.entityId === b.entityId && a.supplierId === b.supplierId && a.reference === b.reference;
}

/** The stable key the database uniqueness is built on. */
export function invoiceIdentityKey(identity: InvoiceIdentity): string {
  return `${identity.entityId}:${identity.supplierId}:${identity.reference}`;
}

/**
 * A 32-byte invoice key, hex-encoded, for the on-chain proposal. Generated once
 * when the first proposal is made and then fixed for that invoice identity.
 */
export function newInvoiceKeyHex(): string {
  const bytes = randomBytes(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
