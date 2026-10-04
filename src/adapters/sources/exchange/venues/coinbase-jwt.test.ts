import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { looksLikeCoinbasePrivateKey, normalizeCoinbasePrivateKey, signCoinbaseJwt } from "./coinbase-jwt";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("signCoinbaseJwt", () => {
  it("produces a verifiable ES256 JWT with CDP claims", () => {
    const keyName = "organizations/org/apiKeys/key";
    const jwt = signCoinbaseJwt({
      apiKey: keyName,
      privateKey,
      method: "GET",
      requestPath: "/v2/accounts?limit=1",
      nowSeconds: 1_700_000_000,
    });
    const [header, payload, signature] = jwt.split(".") as [string, string, string];

    expect(decodePart(header)).toMatchObject({ alg: "ES256", typ: "JWT", kid: keyName });
    expect(decodePart(payload)).toEqual({
      iss: "cdp",
      nbf: 1_700_000_000,
      exp: 1_700_000_120,
      sub: keyName,
      uri: "GET api.coinbase.com/v2/accounts?limit=1",
    });

    const ok = verify(
      "SHA256",
      Buffer.from(`${header}.${payload}`),
      { key: createPublicKey(publicKey), dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("accepts a one-line PEM with escaped newlines", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    expect(normalizeCoinbasePrivateKey(escaped)).toBe(privateKey.trim());
    expect(looksLikeCoinbasePrivateKey(escaped)).toBe(true);
    expect(looksLikeCoinbasePrivateKey("tl-oauth:refresh")).toBe(false);
    expect(looksLikeCoinbasePrivateKey("plain-refresh-token")).toBe(false);

    const jwt = signCoinbaseJwt({
      apiKey: "organizations/org/apiKeys/key",
      privateKey: escaped,
      method: "GET",
      requestPath: "/v2/accounts?limit=1",
    });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("rejects a non-PEM secret", () => {
    expect(() =>
      signCoinbaseJwt({
        apiKey: "organizations/org/apiKeys/key",
        privateKey: "not-a-key",
        method: "GET",
        requestPath: "/v2/accounts",
      }),
    ).toThrow(/ECDSA private key PEM/i);
  });
});
