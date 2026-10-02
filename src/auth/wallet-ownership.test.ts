import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  assessChallenge,
  buildOwnershipMessage,
  CHALLENGE_TTL_MS,
  normalizeAddress,
  normalizeDomain,
  verifyOwnershipSignature,
  type ChallengeRecord,
} from "./wallet-ownership";

const DOMAIN = "ledger.example";
const ORG = "org_harbour";
const SESSION = "user_1";

describe("ownership challenge", () => {
  it("binds the message to the site, organization, network, address, and nonce", () => {
    const expiresAt = new Date("2026-10-02T12:00:00.000Z");
    const message = buildOwnershipMessage({
      domain: DOMAIN,
      organizationId: ORG,
      chain: "ethereum",
      address: "0x0000000000000000000000000000000000000001",
      nonce: "abc",
      expiresAt,
    });
    expect(message).toContain(`Domain: ${DOMAIN}`);
    expect(message).toContain(`Organization: ${ORG}`);
    expect(message).toContain("Chain: ethereum");
    expect(message).toContain("Nonce: abc");
    expect(message).toContain("Expires: 2026-10-02T12:00:00.000Z");
    expect(message).toContain("does not authorize a transfer");
  });

  it("normalizes a host and an address", () => {
    expect(normalizeDomain(" Ledger.Example. ")).toBe("ledger.example");
    expect(normalizeDomain("ledger.example/path")).toBeNull();
    expect(normalizeAddress("ethereum", "0x00000000000000000000000000000000000000aa")?.toLowerCase()).toBe(
      "0x00000000000000000000000000000000000000aa",
    );
    expect(normalizeAddress("solana", "not-an-address")).toBeNull();
  });

  it("rejects expiry, replay, and a challenge bound to someone else", () => {
    const record = sample();
    const binding = {
      organizationId: ORG,
      sessionId: SESSION,
      chain: "ethereum" as const,
      address: record.address,
      domain: DOMAIN,
    };
    expect(assessChallenge(record, new Date(record.expiresAt.getTime() - 1), binding)).toBeNull();
    expect(assessChallenge(record, record.expiresAt, binding)).toMatch(/expired/);
    expect(assessChallenge({ ...record, consumedAt: new Date() }, new Date(), binding)).toMatch(/already used/);
    expect(assessChallenge(record, new Date(), { ...binding, sessionId: "other" })).toMatch(/sign-in/);
    expect(assessChallenge(record, new Date(), { ...binding, domain: "other.example" })).toMatch(/site/);
    expect(assessChallenge(record, new Date(), { ...binding, chain: "polygon" })).toMatch(/network/);
    expect(assessChallenge(record, new Date(), { ...binding, organizationId: "org_other" })).toMatch(/organization/);
  });

  it("accepts an Ethereum personal_sign and rejects a different key", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const record = sample(account.address);
    const signature = await account.signMessage({ message: record.message });
    expect(await verifyOwnershipSignature("ethereum", account.address, record.message, signature)).toBe(true);
    expect(await verifyOwnershipSignature("polygon", account.address, record.message, signature)).toBe(true);
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verifyOwnershipSignature("ethereum", other.address, record.message, signature)).toBe(false);
    expect(await verifyOwnershipSignature("ethereum", account.address, `${record.message}\n`, signature)).toBe(false);
  });

  it("accepts a Solana ed25519 signature and rejects a replay of the wrong message", async () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const address = base58.encode(publicKey);
    const record = sample(address, "solana");
    const signature = ed25519.sign(new TextEncoder().encode(record.message), secretKey);
    const encoded = `0x${Buffer.from(signature).toString("hex")}`;
    await expect(verifyOwnershipSignature("solana", address, record.message, encoded)).resolves.toBe(true);
    await expect(verifyOwnershipSignature("solana", address, "other", encoded)).resolves.toBe(false);
  });
});

function sample(address = "0x00000000000000000000000000000000000000aA", chain: "ethereum" | "solana" = "ethereum"): ChallengeRecord {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = buildOwnershipMessage({
    domain: DOMAIN,
    organizationId: ORG,
    chain,
    address,
    nonce: "nonce",
    expiresAt,
  });
  return {
    organizationId: ORG,
    sessionId: SESSION,
    chain,
    address,
    domain: DOMAIN,
    message,
    expiresAt,
    consumedAt: null,
  };
}
