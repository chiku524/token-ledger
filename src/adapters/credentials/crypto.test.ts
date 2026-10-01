import { describe, expect, it } from "vitest";
import { openSecret, redactSecret, resetSecretKeyCache, sealSecret } from "./crypto";

const KEY = "a-test-encryption-key-of-at-least-32-chars";

describe("sealSecret / openSecret", () => {
  it("round-trips a secret", async () => {
    const sealed = await sealSecret("kraken-api-secret-value", KEY);
    expect(sealed).not.toContain("kraken-api-secret-value");
    expect(sealed.startsWith("v2:aes-256-gcm:")).toBe(true);
    expect(await openSecret(sealed, KEY)).toBe("kraken-api-secret-value");
  });

  it("produces a different blob each time (random IV)", async () => {
    expect(await sealSecret("same", KEY)).not.toBe(await sealSecret("same", KEY));
  });

  it("fails to open with the wrong key", async () => {
    const sealed = await sealSecret("secret", KEY);
    await expect(openSecret(sealed, "a-different-encryption-key-of-at-least-32")).rejects.toThrow(/wrong key|tampered/i);
  });

  it("fails to open a tampered blob", async () => {
    const sealed = await sealSecret("secret", KEY);
    const parts = sealed.split(":");
    const ciphertext = Buffer.from(parts[4]!, "base64");
    ciphertext[0] ^= 0xff;
    parts[4] = ciphertext.toString("base64");
    await expect(openSecret(parts.join(":"), KEY)).rejects.toThrow(/wrong key|tampered/i);
  });

  it("rejects malformed and wrong-version blobs", async () => {
    await expect(openSecret("not-a-sealed-secret", KEY)).rejects.toThrow(/malformed/i);
    await expect(openSecret("v9:aes-256-gcm:a:b:c", KEY)).rejects.toThrow(/version/i);
  });

  it("refuses to seal an empty secret", async () => {
    await expect(sealSecret("", KEY)).rejects.toThrow(/empty/i);
  });

  it("uses the process passphrase cache (still correct after reset)", async () => {
    resetSecretKeyCache();
    const sealed = await sealSecret("value", KEY);
    expect(await openSecret(sealed, KEY)).toBe("value");
  });

  it("still opens a v1 blob sealed with the legacy scrypt key", async () => {
    const { createCipheriv, randomBytes, scryptSync } = await import("node:crypto");
    const key = scryptSync(KEY, "token-ledger.connector-credential.v1", 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update("legacy-value", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacy = ["v1", "aes-256-gcm", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
    expect(await openSecret(legacy, KEY)).toBe("legacy-value");
  });
});

describe("redactSecret", () => {
  it("shows only the last 4 characters", () => {
    expect(redactSecret("supersecretvalue1234")).toMatch(/1234$/);
    expect(redactSecret("supersecretvalue1234")).not.toContain("supersecret");
    expect(redactSecret("")).toBe("");
    expect(redactSecret("ab")).toBe("••••");
  });
});
