import { describe, expect, it } from "vitest";
import { credentialSummary, openExchangeCredential, sealExchangeCredential } from "./store";

const PASS = "a-test-encryption-key-of-at-least-32-chars";

describe("exchange credentials", () => {
  it("seals a key and secret and opens them again", async () => {
    const sealed = await sealExchangeCredential({ apiKey: "kraken-key-1234", apiSecret: "super-secret" }, PASS);
    expect(sealed.sealedKey).not.toContain("kraken-key-1234");
    expect(sealed.sealedSecret).not.toContain("super-secret");
    expect(await openExchangeCredential(sealed, PASS)).toEqual({ apiKey: "kraken-key-1234", apiSecret: "super-secret" });
  });

  it("exposes only a redacted hint for display", async () => {
    const sealed = await sealExchangeCredential({ apiKey: "kraken-key-1234", apiSecret: "super-secret" }, PASS);
    const summary = credentialSummary(sealed);
    expect(summary).toEqual({ keyHint: sealed.keyHint });
    expect(JSON.stringify(summary)).not.toContain("kraken");
    expect(sealed.keyHint).toMatch(/1234$/);
    expect(sealed.keyHint).not.toContain("kraken");
  });

  it("requires both parts", async () => {
    await expect(sealExchangeCredential({ apiKey: "", apiSecret: "s" }, PASS)).rejects.toThrow(/both required/i);
    await expect(sealExchangeCredential({ apiKey: "k", apiSecret: "  " }, PASS)).rejects.toThrow(/both required/i);
  });

  it("trims surrounding whitespace", async () => {
    const sealed = await sealExchangeCredential({ apiKey: " key ", apiSecret: " secret " }, PASS);
    expect(await openExchangeCredential(sealed, PASS)).toEqual({ apiKey: "key", apiSecret: "secret" });
  });
});
