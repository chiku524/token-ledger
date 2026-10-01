import { describe, expect, it } from "vitest";
import { openSecret, redactSecret, resetSecretKeyCache, sealSecret } from "./crypto";

const KEY = "a-test-encryption-key-of-at-least-32-chars";

describe("sealSecret / openSecret", () => {
  it("round-trips a secret", () => {
    const sealed = sealSecret("kraken-api-secret-value", KEY);
    expect(sealed).not.toContain("kraken-api-secret-value");
    expect(sealed.startsWith("v1:aes-256-gcm:")).toBe(true);
    expect(openSecret(sealed, KEY)).toBe("kraken-api-secret-value");
  });
  it("produces a different blob each time (random IV)", () => {
    expect(sealSecret("same", KEY)).not.toBe(sealSecret("same", KEY));
  });

  it("fails to open with the wrong key", () => {
    const sealed = sealSecret("secret", KEY);
    expect(() => openSecret(sealed, "a-different-encryption-key-of-at-least-32")).toThrow(/wrong key|tampered/i);
  });

  it("fails to open a tampered blob", () => {
    const sealed = sealSecret("secret", KEY);
    const parts = sealed.split(":");
    const ciphertext = Buffer.from(parts[4]!, "base64");
    ciphertext[0] ^= 0xff;
    parts[4] = ciphertext.toString("base64");
    expect(() => openSecret(parts.join(":"), KEY)).toThrow(/wrong key|tampered/i);
  });

  it("rejects malformed and wrong-version blobs", () => {
    expect(() => openSecret("not-a-sealed-secret", KEY)).toThrow(/malformed/i);
    expect(() => openSecret("v9:aes-256-gcm:a:b:c", KEY)).toThrow(/version/i);
  });

  it("refuses to seal an empty secret", () => {
    expect(() => sealSecret("", KEY)).toThrow(/empty/i);
  });

  it("uses the process passphrase cache (still correct after reset)", () => {
    resetSecretKeyCache();
    const sealed = sealSecret("value", KEY);
    expect(openSecret(sealed, KEY)).toBe("value");
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
