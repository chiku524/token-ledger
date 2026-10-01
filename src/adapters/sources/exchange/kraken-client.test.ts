import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { KrakenClient, KrakenError, sign } from "./kraken-client";

const CRED = { apiKey: "test-key", apiSecret: Buffer.from("test-secret").toString("base64") };

function envelope<T>(result: T, error: string[] = []): Response {
  return new Response(JSON.stringify({ error, result }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Kraken request signing", () => {
  it("matches Kraken's documented HMAC-SHA512 scheme", () => {
    const nonce = 1616492376594;
    const postData = `nonce=${nonce}`;
    const path = "private/Balance";
    const apiSecret = "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==";
    // Recompute the scheme independently and compare.
    const secret = Buffer.from(apiSecret, "base64");
    const sha256 = createHash("sha256").update(nonce + postData).digest();
    const message = Buffer.concat([Buffer.from(`/0/${path}`), sha256]);
    const expected = createHmac("sha512", secret).update(message).digest("base64");
    expect(sign(path, nonce, postData, apiSecret)).toBe(expected);
  });
});

describe("KrakenClient (read-only)", () => {
  it("signs private reads and never calls a write method", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/0/private/Balance");
      const headers = init?.headers as Record<string, string>;
      expect(headers["API-Key"]).toBe("test-key");
      expect(headers["API-Sign"]).toBeTruthy();
      expect(String(init?.body)).toMatch(/nonce=\d+/);
      // No write path should ever appear.
      expect(String(url)).not.toMatch(/AddOrder|CancelOrder|Withdraw/);
      return envelope({ ZUSD: "100.00" });
    });
    const client = new KrakenClient(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.getBalance();
    expect(result.result).toEqual({ ZUSD: "100.00" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses a strictly increasing nonce across calls", async () => {
    const nonces: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      nonces.push(body.get("nonce")!);
      return envelope({});
    });
    const client = new KrakenClient(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.getBalance();
    await client.getBalance();
    expect(Number(nonces[1])).toBeGreaterThan(Number(nonces[0]!));
  });

  it("surfaces an auth failure as a typed error", async () => {
    const fetchImpl = vi.fn(async () => envelope(null, ["EAPI:Invalid key"]));
    const client = new KrakenClient(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getBalance()).rejects.toMatchObject({ name: "KrakenError", kind: "auth" });
  });

  it("surfaces rate limits and HTTP errors", async () => {
    const rate = vi.fn(async () => envelope(null, ["EAPI:Rate limit exceeded"]));
    await expect(new KrakenClient(CRED, { fetchImpl: rate as unknown as typeof fetch }).getTradesHistory()).rejects.toMatchObject({ kind: "rate" });

    const http = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(new KrakenClient(CRED, { fetchImpl: http as unknown as typeof fetch }).getBalance()).rejects.toBeInstanceOf(KrakenError);
  });

  it("reads public asset metadata without a credential", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/0/public/Assets");
      expect((init?.headers as Record<string, string>)["API-Key"]).toBeUndefined();
      return envelope({ XXBT: { aclass: "currency", altname: "XBT", decimals: 10, display_decimals: 5, status: "enabled" } });
    });
    const client = new KrakenClient(CRED, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const assets = await client.getAssets();
    expect(assets.XXBT?.decimals).toBe(10);
  });
});
