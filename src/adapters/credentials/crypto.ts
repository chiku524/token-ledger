/**
 * Sealing for connector credentials (exchange API keys and secrets).
 *
 * Plaintext never leaves the server and is never written to the database. A
 * secret is sealed with AES-256-GCM under a key derived from
 * CONNECTOR_ENCRYPTION_KEY, and the sealed blob carries its own IV and auth
 * tag. The compact form is:
 *
 *   v1:aes-256-gcm:<iv-b64>:<tag-b64>:<ciphertext-b64>
 *
 * The version prefix lets the format change without guessing.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT = "token-ledger.connector-credential.v1";

const keyCache = new Map<string, Buffer>();

/** Derive the 32-byte key once per passphrase. scrypt is intentionally slow. */
function deriveKey(passphrase: string): Buffer {
  const cached = keyCache.get(passphrase);
  if (cached) return cached;
  const key = scryptSync(passphrase, SALT, KEY_BYTES);
  keyCache.set(passphrase, key);
  return key;
}

export function sealSecret(plaintext: string, passphrase: string): string {
  if (plaintext.length === 0) throw new Error("Cannot seal an empty secret.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(passphrase), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, ALGORITHM, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function openSecret(sealed: string, passphrase: string): string {
  const parts = sealed.split(":");
  if (parts.length !== 5) throw new Error("Sealed secret is malformed.");
  const [version, algorithm, ivB64, tagB64, ciphertextB64] = parts as [string, string, string, string, string];
  if (version !== VERSION) throw new Error(`Unsupported sealed-secret version "${version}".`);
  if (algorithm !== ALGORITHM) throw new Error(`Unsupported sealed-secret algorithm "${algorithm}".`);

  const decipher = createDecipheriv(ALGORITHM, deriveKey(passphrase), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // A wrong key or a tampered blob fails the GCM auth tag.
    throw new Error("Sealed secret could not be opened (wrong key or tampered data).");
  }
}

/** Never reveal a secret; show only enough to recognise it. */
export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}

/** Test-only: clear the derived-key cache. */
export function resetSecretKeyCache(): void {
  keyCache.clear();
}
