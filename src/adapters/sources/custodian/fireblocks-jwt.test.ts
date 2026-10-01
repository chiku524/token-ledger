import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signFireblocksJwt } from "./fireblocks-jwt";

// A throwaway RSA key pair for the test.
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("signFireblocksJwt", () => {
  it("produces a verifiable RS256 JWT with the required claims", () => {
    const jwt = signFireblocksJwt({ apiKey: "api-key-123", privateKey, uri: "/v1/vault/assets" });
    const [header, payload, signature] = jwt.split(".") as [string, string, string];

    expect(decodePart(header)).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = decodePart(payload);
    expect(claims.uri).toBe("/v1/vault/assets");
    expect(claims.sub).toBe("api-key-123");
    expect(typeof claims.nonce).toBe("string");
    expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(30);

    // The signature verifies against the public key.
    const ok = verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPublicKey(publicKey), Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("uses a unique nonce and carries the body hash of an empty GET", () => {
    const a = decodePart(signFireblocksJwt({ apiKey: "k", privateKey, uri: "/v1/transactions" }).split(".")[1]!);
    const b = decodePart(signFireblocksJwt({ apiKey: "k", privateKey, uri: "/v1/transactions" }).split(".")[1]!);
    expect(a.nonce).not.toBe(b.nonce);
    // SHA-256 of the empty string.
    expect(a.bodyHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
