/**
 * Fireblocks JWT authentication. Each request is signed with the API user's RSA
 * private key (RS256). The JWT payload carries the request URI, a unique nonce,
 * issued-at and expiry (< 30s), the API key as `sub`, and a body hash.
 *
 * See docs/adr-custodian-connectors.md.
 */
import { createHash, createPrivateKey, createSign, randomUUID } from "node:crypto";

export interface FireblocksJwtInput {
  apiKey: string;
  privateKey: string;
  uri: string;
  body?: string;
}

export function signFireblocksJwt(input: FireblocksJwtInput): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    uri: input.uri,
    nonce: randomUUID(),
    iat: now,
    exp: now + 25,
    sub: input.apiKey,
    bodyHash: createHash("sha256").update(input.body ?? "").digest("hex"),
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(input.privateKey)).toString("base64url");

  return `${signingInput}.${signature}`;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
