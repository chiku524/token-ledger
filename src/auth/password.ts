/**
 * Password hashing on the Web Crypto API (PBKDF2-HMAC-SHA256), so the same code
 * runs on Node and on Cloudflare Workers. scrypt is not available in Workerd,
 * so legacy `scrypt$...` hashes are still verified (Node only) and otherwise
 * fail closed. A verified legacy hash can be re-hashed with `needsRehash`.
 */
import { constantTimeEqual, fromBase64Url, randomBytes, toBase64Url } from "@/lib/webcrypto";

/**
 * Cloudflare Workers (Workerd) refuses PBKDF2 above 100,000 iterations:
 * "iteration counts above 100000 are not supported". Node has no such cap, but
 * the same code must run on both, so use the Workers ceiling. Each hash stores
 * its own iteration count, so hashes made at a higher count still verify where
 * the platform allows it.
 */
const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const HASH = "sha256";

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, keyBytes: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    keyBytes * 8,
  );
  return new Uint8Array(bits);
}

/** PBKDF2 hash. Parameters are stored with the hash so verification does not depend on a later default. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(password, salt, ITERATIONS, KEY_BYTES);
  return `pbkdf2$${HASH}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("scrypt$")) return verifyScrypt(password, stored);
  if (!stored.startsWith("pbkdf2$")) return false;

  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== HASH) return false;
  const iterations = Number(parts[2]);
  const saltText = parts[3];
  const hashText = parts[4];
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 10_000_000) return false;
  if (!saltText || !hashText) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(saltText);
    expected = fromBase64Url(hashText);
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length < 16) return false;

  // A stored hash may use a higher iteration count than this runtime allows
  // (Workerd caps PBKDF2 at 100,000). If deriving throws, fail closed rather
  // than crashing the request; needsRehash flags it for a re-hash where allowed.
  let actual: Uint8Array;
  try {
    actual = await pbkdf2(password, salt, iterations, expected.length);
  } catch {
    return false;
  }
  return constantTimeEqual(actual, expected);
}

/** True when a stored hash uses an older scheme or cost and should be re-hashed on the next sign-in. */
export function needsRehash(stored: string): boolean {
  if (stored.startsWith("scrypt$")) return true;
  const parts = stored.split("$");
  return parts[0] !== "pbkdf2" || Number(parts[2]) < ITERATIONS;
}

/**
 * Verify a legacy scrypt hash. Imported lazily so the scrypt dependency is not
 * pulled into a Worker bundle; on a runtime without `node:crypto` this returns
 * false, which fails closed. The fix there is to re-hash on the next sign-in
 * after a migration to PBKDF2.
 */
async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltText = parts[4];
  const hashText = parts[5];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !saltText || !hashText) return false;
  if (n < 2 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 8) return false;
  try {
    const { scrypt, timingSafeEqual } = await import("node:crypto");
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 8 || expected.length < 16) return false;
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
