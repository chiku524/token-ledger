/**
 * Coinbase App CDP API key JWT (ES256). Each request needs a short-lived bearer
 * token signed with the ECDSA private key from the CDP portal.
 *
 * See https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication
 */
import { createPrivateKey, createSign, randomBytes } from "node:crypto";

const HOST = "api.coinbase.com";

export interface CoinbaseJwtInput {
  /** CDP key name, e.g. organizations/{org_id}/apiKeys/{key_id}. */
  apiKey: string;
  /** EC private key PEM (ECDSA / ES256). */
  privateKey: string;
  method: "GET" | "POST";
  /** Path including query string, e.g. /v2/accounts?limit=1 */
  requestPath: string;
  nowSeconds?: number;
}

/** True when the secret looks like an EC/PKCS8 private key rather than an OAuth refresh token. */
export function looksLikeCoinbasePrivateKey(secret: string): boolean {
  const pem = normalizeCoinbasePrivateKey(secret);
  return pem.includes("BEGIN") && pem.includes("PRIVATE KEY");
}

/** Turn pasted `\n` escapes and odd whitespace into a PEM OpenSSL can parse. */
export function normalizeCoinbasePrivateKey(secret: string): string {
  return secret.replace(/\\n/g, "\n").trim();
}
export function signCoinbaseJwt(input: CoinbaseJwtInput): string {
  const privateKeyPem = normalizeCoinbasePrivateKey(input.privateKey);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const uri = `${input.method} ${HOST}${input.requestPath}`;
  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: input.apiKey,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload = {
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    sub: input.apiKey,
    uri,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  let key;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("Coinbase API secret must be the ECDSA private key PEM from the CDP portal.");
  }
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // JWT ES256 requires IEEE-P1363 signatures, not DER.
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
