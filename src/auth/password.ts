import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

/** scrypt hash. Parameters are stored with the hash so verification does not depend on a later default. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltText = parts[4];
  const hashText = parts[5];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !saltText || !hashText) return false;
  if (n < 2 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 8) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length < 8 || expected.length < 16) return false;
  const actual = (await scryptAsync(password, salt, expected.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 })) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
