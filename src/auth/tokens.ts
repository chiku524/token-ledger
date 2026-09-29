import { createHash, createHmac, randomBytes } from "node:crypto";

export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** Bind a bearer token to AUTH_SECRET, then store only the hash. */
export function sealToken(token: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(token).digest();
  return createHash("sha256").update(mac).digest("base64url");
}
