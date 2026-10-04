import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isCoinbaseApiKeySecret,
  looksLikeCoinbaseEd25519Secret,
  looksLikeCoinbasePrivateKey,
  normalizeCoinbasePrivateKey,
  signCoinbaseJwt,
} from "./coinbase-jwt";

const ec = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const ed = generateKeyPairSync("ed25519");
const edJwk = ed.privateKey.export({ format: "jwk" }) as { d: string; x: string };
const edSecret = Buffer.concat([Buffer.from(edJwk.d, "base64url"), Buffer.from(edJwk.x, "base64url")]).toString(
  "base64",
);

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("signCoinbaseJwt", () => {
  it("produces a verifiable ES256 JWT with CDP claims for a PEM secret", () => {
    const keyName = "organizations/org/apiKeys/key";
    const jwt = signCoinbaseJwt({
      apiKey: keyName,
      privateKey: ec.privateKey,
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
      { key: createPublicKey(ec.publicKey), dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("produces a verifiable EdDSA JWT for a CDP Ed25519 base64 secret", () => {
    const keyName = "organizations/org/apiKeys/ed";
    expect(looksLikeCoinbaseEd25519Secret(edSecret)).toBe(true);
    expect(isCoinbaseApiKeySecret(edSecret)).toBe(true);

    const jwt = signCoinbaseJwt({
      apiKey: keyName,
      privateKey: edSecret,
      method: "GET",
      requestPath: "/v2/accounts?limit=1",
      nowSeconds: 1_700_000_000,
    });
    const [header, payload, signature] = jwt.split(".") as [string, string, string];
    expect(decodePart(header)).toMatchObject({ alg: "EdDSA", kid: keyName });
    expect(decodePart(payload)).toMatchObject({
      uri: "GET api.coinbase.com/v2/accounts?limit=1",
      sub: keyName,
    });

    const ok = verify(null, Buffer.from(`${header}.${payload}`), ed.publicKey, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("accepts a one-line PEM with escaped newlines", () => {
    const escaped = ec.privateKey.replace(/\n/g, "\\n");
    expect(normalizeCoinbasePrivateKey(escaped)).toBe(ec.privateKey.trim());
    expect(looksLikeCoinbasePrivateKey(escaped)).toBe(true);
    expect(looksLikeCoinbasePrivateKey("tl-oauth:refresh")).toBe(false);
    expect(looksLikeCoinbaseEd25519Secret("plain-refresh-token")).toBe(false);

    const jwt = signCoinbaseJwt({
      apiKey: "organizations/org/apiKeys/key",
      privateKey: escaped,
      method: "GET",
      requestPath: "/v2/accounts?limit=1",
    });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("rejects a non-key secret", () => {
    expect(() =>
      signCoinbaseJwt({
        apiKey: "organizations/org/apiKeys/key",
        privateKey: "not-a-key",
        method: "GET",
        requestPath: "/v2/accounts",
      }),
    ).toThrow(/ECDSA PEM or Ed25519 base64/i);
  });
});
