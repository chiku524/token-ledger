import { describe, expect, it } from "vitest";
import {
  assessBindingChallenge,
  buildBindingMessage,
  BINDING_CHALLENGE_TTL_MS,
  normalizeBindingAddress,
  type BindingChallengeRecord,
} from "./wallet-binding";

const ADDRESS = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";
const NOW = new Date("2026-10-03T00:00:00.000Z");

function record(overrides: Partial<BindingChallengeRecord> = {}): BindingChallengeRecord {
  return {
    organizationId: "org_1",
    sessionId: "sess_1",
    entityId: "ent_1",
    cluster: "devnet",
    address: ADDRESS,
    domain: "app.tokenledger.win",
    message: "msg",
    expiresAt: new Date(NOW.getTime() + BINDING_CHALLENGE_TTL_MS),
    consumedAt: null,
    ...overrides,
  };
}

const attempt = {
  organizationId: "org_1",
  sessionId: "sess_1",
  entityId: "ent_1",
  cluster: "devnet" as const,
  address: ADDRESS,
  domain: "app.tokenledger.win",
};

describe("buildBindingMessage", () => {
  it("names the domain, org, entity and cluster, and disclaims authorization", () => {
    const message = buildBindingMessage({
      domain: "app.tokenledger.win",
      organizationId: "org_1",
      entityId: "ent_1",
      cluster: "devnet",
      address: ADDRESS,
      nonce: "abc",
      expiresAt: NOW,
    });
    expect(message).toContain("Cluster: devnet");
    expect(message).toContain("Entity: ent_1");
    expect(message).toContain("authorizes no transfer");
  });
});

describe("assessBindingChallenge", () => {
  it("accepts a fresh, matching challenge", () => {
    expect(assessBindingChallenge(record(), NOW, attempt)).toBeNull();
  });

  it("rejects a used or expired challenge", () => {
    expect(assessBindingChallenge(record({ consumedAt: NOW }), NOW, attempt)).toMatch(/already used/i);
    expect(assessBindingChallenge(record({ expiresAt: NOW }), NOW, attempt)).toMatch(/expired/i);
  });

  it("rejects a different cluster, entity, session, or domain", () => {
    expect(assessBindingChallenge(record(), NOW, { ...attempt, cluster: "mainnet-beta" })).toMatch(/cluster/i);
    expect(assessBindingChallenge(record(), NOW, { ...attempt, entityId: "ent_2" })).toMatch(/company/i);
    expect(assessBindingChallenge(record(), NOW, { ...attempt, sessionId: "sess_2" })).toMatch(/sign-in/i);
    expect(assessBindingChallenge(record(), NOW, { ...attempt, domain: "evil.example" })).toMatch(/site/i);
  });
});

describe("normalizeBindingAddress", () => {
  it("accepts a Solana address and rejects others", () => {
    expect(normalizeBindingAddress(ADDRESS)).toBe(ADDRESS);
    expect(normalizeBindingAddress("0x1234")).toBeNull();
    expect(normalizeBindingAddress("not an address")).toBeNull();
  });
});
