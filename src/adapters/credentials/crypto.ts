/**
 * Sealing for connector credentials (exchange API keys and secrets).
 *
 * Plaintext never leaves the server and is never written to the database. A
 * secret is sealed with AES-256-GCM under a key derived from
 * CONNECTOR_ENCRYPTION_KEY. The compact form is:
 *
 *   v2:aes-256-gcm:<iv-b64>:<tag-b64>:<ciphertext-b64>
 *
 * The version prefix lets the format change without guessing. `v2` derives the
 * key with PBKDF2 (Web Crypto), which runs on Node and Cloudflare Workers. `v1`
 * used scrypt (Node only) and is still opened for compatibility; on a runtime
 * without `node:crypto` a `v1` blob cannot be opened, and re-sealing it as `v2`
 * is the migration.
 */
import { fromBase64, randomBytes, toBase64 } from "@/lib/webcrypto";

const VERSION = "v2";
const LEGACY_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
/**
 * Workerd caps PBKDF2 at 100,000 iterations, and this must run on both Node and
 * Workers, so use the Workers ceiling. `v2` blobs are opened and re-sealed with
 * this count; a blob sealed at a higher count on Node would need re-sealing.
 */
const PBKDF2_ITERATIONS = 100_000;
const SALT = "token-ledger.connector-credential.v1";

const keyCache = new Map<string, Promise<CryptoKey>>();

/** Derive the AES-GCM key once per passphrase. PBKDF2 is intentionally slow. */
function deriveKey(passphrase: string): Promise<CryptoKey> {
  const cached = keyCache.get(passphrase);
  if (cached) return cached;
  const derived = (async () => {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode(SALT), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      material,
      KEY_BYTES * 8,
    );
    return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();
  keyCache.set(passphrase, derived);
  return derived;
}

export async function sealSecret(plaintext: string, passphrase: string): Promise<string> {
  if (plaintext.length === 0) throw new Error("Cannot seal an empty secret.");
  const key = await deriveKey(passphrase);
  const iv = randomBytes(IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  // Web Crypto appends the 16-byte auth tag to the ciphertext.
  const bytes = new Uint8Array(encrypted);
  const ciphertext = bytes.slice(0, bytes.length - 16);
  const tag = bytes.slice(bytes.length - 16);
  return [VERSION, ALGORITHM, toBase64(iv), toBase64(tag), toBase64(ciphertext)].join(":");
}

export async function openSecret(sealed: string, passphrase: string): Promise<string> {
  const parts = sealed.split(":");
  if (parts.length !== 5) throw new Error("Sealed secret is malformed.");
  const [version, algorithm, ivB64, tagB64, ciphertextB64] = parts as [string, string, string, string, string];
  if (algorithm !== ALGORITHM) throw new Error(`Unsupported sealed-secret algorithm "${algorithm}".`);
  if (version === LEGACY_VERSION) return openLegacySecret(ivB64, tagB64, ciphertextB64, passphrase);
  if (version !== VERSION) throw new Error(`Unsupported sealed-secret version "${version}".`);

  const key = await deriveKey(passphrase);
  const iv = fromBase64(ivB64);
  const tag = fromBase64(tagB64);
  const ciphertext = fromBase64(ciphertextB64);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, combined);
    return new TextDecoder().decode(plaintext);
  } catch {
    // A wrong key or a tampered blob fails the GCM auth tag.
    throw new Error("Sealed secret could not be opened (wrong key or tampered data).");
  }
}

/**
 * Open a `v1` blob sealed with a scrypt-derived key. Lazy import keeps scrypt out
 * of a Worker bundle; on a runtime without `node:crypto` this fails closed.
 */
async function openLegacySecret(ivB64: string, tagB64: string, ciphertextB64: string, passphrase: string): Promise<string> {
  try {
    const { createDecipheriv, scryptSync } = await import("node:crypto");
    const key = scryptSync(passphrase, SALT, KEY_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
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
