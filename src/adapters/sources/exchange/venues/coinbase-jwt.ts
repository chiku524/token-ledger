/**
 * Coinbase App CDP API key JWT. Each request needs a short-lived bearer token.
 *
 * CDP issues two secret shapes:
 * - ECDSA PEM → ES256 JWT (`uri` claim; App API docs)
 * - Ed25519 base64 (64 bytes: seed + public key) → EdDSA JWT (`uris` claim; CDP SDK / CCXT)
 *
 * Both include `aud: ["cdp_service"]` and `iat`. The JWT URI path omits the query
 * string (request URL may still carry query params).
 *
 * See:
 * - https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication
 * - https://docs.cdp.coinbase.com/get-started/authentication/jwt-authentication
 * - @coinbase/cdp-sdk auth/utils/jwt
 */
import { createPrivateKey, createSign, randomBytes, sign as cryptoSign } from "node:crypto";

const HOST = "api.coinbase.com";

export interface CoinbaseJwtInput {
  /** CDP key name, e.g. organizations/{org_id}/apiKeys/{key_id} or the key UUID. */
  apiKey: string;
  /** EC private key PEM, or Ed25519 secret as standard base64. */
  privateKey: string;
  method: "GET" | "POST";
  /** Path including optional query string; query is stripped inside the JWT claim. */
  requestPath: string;
  nowSeconds?: number;
}

/** Paste helpers: portal download JSON or raw fields. */
export interface CoinbaseCredentialParts {
  apiKey: string;
  apiSecret: string;
}

/** True when the secret looks like an EC/PKCS8 private key PEM. */
export function looksLikeCoinbasePrivateKey(secret: string): boolean {
  const pem = normalizeCoinbasePrivateKey(secret);
  return pem.includes("BEGIN") && pem.includes("PRIVATE KEY");
}

/**
 * True when the secret is a CDP Ed25519 key: standard base64 decoding to exactly
 * 64 bytes (32-byte seed + 32-byte public key). Typical length is 88 chars with `=`.
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

/**
 * Accept either raw fields or a CDP portal JSON key file paste
 * (`{ "name"|"id", "privateKey" }`).
 */
export function parseCoinbaseCredentialParts(apiKey: string, apiSecret: string): CoinbaseCredentialParts {
  const keyTrim = apiKey.trim();
  const secretTrim = apiSecret.trim();
  const fromKey = tryParseKeyFile(keyTrim);
  if (fromKey) return fromKey;
  const fromSecret = tryParseKeyFile(secretTrim);
  if (fromSecret) return fromSecret;
  return { apiKey: keyTrim, apiSecret: secretTrim };
}

function tryParseKeyFile(value: string): CoinbaseCredentialParts | null {
  if (!value.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as { name?: unknown; id?: unknown; privateKey?: unknown };
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const privateKey = typeof parsed.privateKey === "string" ? parsed.privateKey : "";
    const apiKey = name || id;
    if (!apiKey || !privateKey.trim()) return null;
    return { apiKey, apiSecret: privateKey };
  } catch {
    return null;
  }
}

/** Path used inside the JWT claim — query string stripped (CCXT / CDP practice). */
export function coinbaseJwtRequestPath(requestPath: string): string {
  const path = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const q = path.indexOf("?");
  return q > 0 ? path.slice(0, q) : path;
}

export function signCoinbaseJwt(input: CoinbaseJwtInput): string {
  const secret = input.privateKey.trim();
  const apiKey = input.apiKey.trim();
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const path = coinbaseJwtRequestPath(input.requestPath);
  const uri = `${input.method} ${HOST}${path}`;
  const nonce = randomBytes(16).toString("hex");

  if (looksLikeCoinbasePrivateKey(secret)) {
    return signEs256Jwt({
      apiKey,
      privateKeyPem: normalizeCoinbasePrivateKey(secret),
      uri,
      nonce,
      now,
    });
  }
  if (looksLikeCoinbaseEd25519Secret(secret)) {
    return signEdDsaJwt({
      apiKey,
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
  // App API ES256 docs use singular `uri`. Include aud/iat used by current JWT auth docs.
  const header = { alg: "ES256", typ: "JWT", kid: input.apiKey, nonce: input.nonce };
  const payload = {
    sub: input.apiKey,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: input.now,
    iat: input.now,
    exp: input.now + 120,
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
  // CDP SDK + CCXT: EdDSA uses `uris` (array), not `uri`.
  const header = { alg: "EdDSA", typ: "JWT", kid: input.apiKey, nonce: input.nonce };
  const payload = {
    sub: input.apiKey,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: input.now,
    iat: input.now,
    exp: input.now + 120,
    uris: [input.uri],
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = cryptoSign(null, Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
