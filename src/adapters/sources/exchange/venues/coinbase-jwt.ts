/**
 * Coinbase App CDP API key JWT. Each request needs a short-lived bearer token.
 *
 * CDP issues two secret shapes:
 * - ECDSA PEM → ES256 JWT
 * - Ed25519 base64 (64 bytes decoded: seed + public key) → EdDSA JWT (CDP default)
 *
 * See https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication
 * and @coinbase/cdp-sdk auth/utils/jwt.
 */
import { createPrivateKey, createSign, randomBytes, sign as cryptoSign } from "node:crypto";

const HOST = "api.coinbase.com";

export interface CoinbaseJwtInput {
  /** CDP key name, e.g. organizations/{org_id}/apiKeys/{key_id}. */
  apiKey: string;
  /** EC private key PEM, or Ed25519 secret as standard base64. */
  privateKey: string;
  method: "GET" | "POST";
  /** Path including query string, e.g. /v2/accounts?limit=1 */
  requestPath: string;
  nowSeconds?: number;
}

/** True when the secret looks like an EC/PKCS8 private key PEM. */
export function looksLikeCoinbasePrivateKey(secret: string): boolean {
  const pem = normalizeCoinbasePrivateKey(secret);
  return pem.includes("BEGIN") && pem.includes("PRIVATE KEY");
}

/**
 * True when the secret is a CDP Ed25519 key: standard base64 decoding to exactly
 * 64 bytes (32-byte seed + 32-byte public key).
 */
export function looksLikeCoinbaseEd25519Secret(secret: string): boolean {
  const trimmed = secret.trim();
  if (!trimmed || looksLikeCoinbasePrivateKey(trimmed)) return false;
  try {
    return Buffer.from(trimmed, "base64").length === 64;
  } catch {
    return false;
  }
}

export function isCoinbaseApiKeySecret(secret: string): boolean {
  return looksLikeCoinbasePrivateKey(secret) || looksLikeCoinbaseEd25519Secret(secret);
}

/** Turn pasted `\n` escapes and odd whitespace into a PEM OpenSSL can parse. */
export function normalizeCoinbasePrivateKey(secret: string): string {
  return secret.replace(/\\n/g, "\n").trim();
}

export function signCoinbaseJwt(input: CoinbaseJwtInput): string {
  const secret = input.privateKey.trim();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const uri = `${input.method} ${HOST}${input.requestPath}`;
  const nonce = randomBytes(16).toString("hex");

  if (looksLikeCoinbasePrivateKey(secret)) {
    return signEs256Jwt({
      apiKey: input.apiKey,
      privateKeyPem: normalizeCoinbasePrivateKey(secret),
      uri,
      nonce,
      now,
    });
  }
  if (looksLikeCoinbaseEd25519Secret(secret)) {
    return signEdDsaJwt({
      apiKey: input.apiKey,
      secretBase64: secret,
      uri,
      nonce,
      now,
    });
  }
  throw new Error(
    "Coinbase API secret must be an ECDSA PEM or Ed25519 base64 secret from the CDP portal.",
  );
}

function signEs256Jwt(input: {
  apiKey: string;
  privateKeyPem: string;
  uri: string;
  nonce: string;
  now: number;
}): string {
  const header = { alg: "ES256", typ: "JWT", kid: input.apiKey, nonce: input.nonce };
  const payload = {
    iss: "cdp",
    nbf: input.now,
    exp: input.now + 120,
    sub: input.apiKey,
    uri: input.uri,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  let key;
  try {
    key = createPrivateKey(input.privateKeyPem);
  } catch {
    throw new Error("Coinbase API secret must be a valid ECDSA private key PEM from the CDP portal.");
  }
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // JWT ES256 requires IEEE-P1363 signatures, not DER.
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function signEdDsaJwt(input: {
  apiKey: string;
  secretBase64: string;
  uri: string;
  nonce: string;
  now: number;
}): string {
  const decoded = Buffer.from(input.secretBase64, "base64");
  if (decoded.length !== 64) {
    throw new Error("Coinbase Ed25519 API secret must decode to 64 bytes.");
  }
  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  const key = createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
      x: publicKey.toString("base64url"),
    },
    format: "jwk",
  });
  const header = { alg: "EdDSA", typ: "JWT", kid: input.apiKey, nonce: input.nonce };
  const payload = {
    iss: "cdp",
    nbf: input.now,
    exp: input.now + 120,
    sub: input.apiKey,
    uri: input.uri,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign(null, Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
