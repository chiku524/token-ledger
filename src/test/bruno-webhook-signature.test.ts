import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Guard the Bruno collection's dependency-free HMAC-SHA256 helper against Node's
 * own crypto. Bruno's script sandbox exposes no `node:crypto`, so the signed
 * webhook request in `bruno/api/webhooks/source.bru` computes its signature with
 * `bruno/scripts/hmac-sha256.js`; if that drifted, the manual test would sign
 * wrong. This keeps the two in lockstep.
 */
const require = createRequire(import.meta.url);
const helper = require("../../bruno/scripts/hmac-sha256.js") as {
  hmacSha256Hex(key: string, message: string): string;
  deriveSourceSecret(masterSecret: string, sourceId: string): string;
  signRawBody(rawBody: string, sourceSecret: string, timestampSeconds: number): string;
};

describe("bruno hmac-sha256 helper", () => {
  it("matches node:crypto HMAC-SHA256 across edge cases", () => {
    const cases: [string, string][] = [
      ["key", "The quick brown fox jumps over the lazy dog"],
      ["", "abc"],
      ["secret", ""],
      ["a".repeat(200), "x".repeat(1000)], // key and message both longer than a block
      ["master", "source:src_123"],
    ];
    for (const [key, message] of cases) {
      expect(helper.hmacSha256Hex(key, message)).toBe(createHmac("sha256", key).update(message).digest("hex"));
    }
  });

  it("derives the per-source secret exactly as the server does", () => {
    const master = "master-secret";
    const sourceId = "src_123";
    expect(helper.deriveSourceSecret(master, sourceId)).toBe(
      createHmac("sha256", master).update(`source:${sourceId}`).digest("hex"),
    );
  });

  it("builds the same signature header the server verifies", () => {
    const master = "master-secret";
    const sourceId = "src_123";
    const t = 1_700_000_000;
    const rawBody = JSON.stringify({ sourceId, externalId: "e1", quantity: "12.5" });
    const sourceSecret = createHmac("sha256", master).update(`source:${sourceId}`).digest("hex");
    const expected = createHmac("sha256", sourceSecret).update(`${t}.${rawBody}`).digest("hex");
    expect(helper.signRawBody(rawBody, helper.deriveSourceSecret(master, sourceId), t)).toBe(`t=${t},v1=${expected}`);
  });
});
