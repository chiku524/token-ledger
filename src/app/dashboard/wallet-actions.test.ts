import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { exampleBooks } from "@/data/example-books";
import { BooksWriteError, insertConnection } from "@/db/write";
import {
  actorOf,
  challengeTable,
  CROSS_SITE,
  expectError,
  expectSaved,
  form,
  FORM_EXPIRED,
  MY,
  ORG,
  OUTSIDE_ACCESS,
  redirectOf,
  resetRequest,
  SG,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import { issueOwnershipChallenge, verifyWalletOwnershipAction } from "./wallet-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/client", async () => (await import("@/test/server-harness")).dbClientMock);
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/write")>()),
  insertConnection: vi.fn(async () => undefined),
}));

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";
const SETTINGS = "/dashboard/settings";
const wallet = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

async function issue(fields: Record<string, string> = {}) {
  return issueOwnershipChallenge(form({ entityId: MY, chain: "ethereum", address: wallet.address.toLowerCase(), ...fields }));
}

async function issuedChallenge(): Promise<{ challengeId: string; message: string; signature: string }> {
  const issued = await issue();
  if ("error" in issued) throw new Error(issued.error);
  challengeTable.rows = [{ ...challengeTable.inserted[0]!, consumedAt: null }];
  return { ...issued, signature: await wallet.signMessage({ message: issued.message }) };
}

function verifyForm(challenge: { challengeId: string; signature: string }, fields: Record<string, string> = {}) {
  return form({ challengeId: challenge.challengeId, signature: challenge.signature, name: "Treasury signer", role: "cold", ...fields });
}

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("issueOwnershipChallenge", () => {
  it.each(["owner", "admin", "accountant", "approver", "viewer"] as const)("lets a %s start a challenge bound to the session and site", async (role) => {
    const user = signInLive(role);
    const issued = await issue();
    if ("error" in issued) throw new Error(issued.error);
    expect(issued.challengeId).toMatch(/^own_[0-9a-f]{16}$/);
    expect(issued.message).toContain("Domain: ledger.test");
    expect(issued.message).toContain(`Organization: ${ORG}`);
    expect(issued.message).toContain(`Address: ${wallet.address}`);
    const row = challengeTable.inserted[0]!;
    expect(row).toMatchObject({ id: issued.challengeId, organizationId: ORG, sessionId: user.id, entityId: MY, chain: "ethereum", address: wallet.address });
    const ttl = (row.expiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    expect(await issue()).toEqual({ error: READ_ONLY });
    expect(challengeTable.inserted).toHaveLength(0);
  });

  it.each([
    [{ chain: "bitcoin" }, "Choose Ethereum, Solana, or Polygon."],
    [{ address: "0x1234" }, "That address does not match the network."],
    [{ chain: "solana" }, "That address does not match the network."],
    [{ entityId: "ent_other" }, "Choose a company in this organization."],
  ])("refuses %o", async (fields, error) => {
    signInLive("owner");
    expect(await issue(fields)).toEqual({ error });
    expect(challengeTable.inserted).toHaveLength(0);
  });

  it("refuses a company outside the user's scope", async () => {
    signInLive("viewer", { entityScope: [SG] });
    expect(await issue()).toEqual({ error: OUTSIDE_ACCESS });
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("owner");
    expect(await issueOwnershipChallenge(form({ entityId: MY, chain: "ethereum", address: wallet.address }, { csrf: "stale" }))).toEqual({ error: FORM_EXPIRED });
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("owner");
    expect(await issue()).toEqual({ error: CROSS_SITE });
  });

  it("returns a generic error for a signed-out visitor", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    expect(await issue()).toEqual({ error: "Could not start verification." });
  });

  it("returns a generic error when the challenge cannot be stored", async () => {
    signInLive("owner");
    challengeTable.insertError = new Error("relation does not exist");
    expect(await issue()).toEqual({ error: "Could not start verification." });
  });
});

describe("verifyWalletOwnershipAction", () => {
  it("adds a verified, read-only connection from a real signature", async () => {
    const user = signInLive("viewer");
    const challenge = await issuedChallenge();
    await expectSaved(
      verifyWalletOwnershipAction(verifyForm(challenge, { next: "/dashboard/setup?step=wallet" })),
      "/dashboard/setup",
      "Wallet verified. The connection is read-only, and no key was stored.",
    );
    const [books, draft, actor, credential, challengeId] = vi.mocked(insertConnection).mock.calls[0]!;
    expect(books).toBe(exampleBooks);
    expect(actor).toBe(actorOf(user));
    expect(credential).toBeUndefined();
    expect(challengeId).toBe(challenge.challengeId);
    expect(draft.connection).toMatchObject({ ownership: "verified", verifiedAddress: wallet.address, venue: "ethereum", mode: "watch" });
    expect(draft.source).toMatchObject({ entityId: MY, role: "cold", name: "Treasury signer", identifier: wallet.address });
  });

  it("refuses a signature from another key", async () => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    const other = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
    const signature = await other.signMessage({ message: challenge.message });
    await expectError(verifyWalletOwnershipAction(verifyForm({ ...challenge, signature })), SETTINGS, "The signature does not match this address.");
    expect(insertConnection).not.toHaveBeenCalled();
  });

  it.each([
    ["already used", { consumedAt: new Date() }, "This verification was already used."],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }, "This verification expired. Start again."],
    ["from another sign-in", { sessionId: "user_someone_else" }, "This verification is for a different sign-in."],
    ["for another site", { domain: "evil.example" }, "This verification is for a different site."],
  ])("refuses a challenge %s", async (_label, change, message) => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    challengeTable.rows = [{ ...challengeTable.rows[0]!, ...change }];
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge)), SETTINGS, message);
    expect(insertConnection).not.toHaveBeenCalled();
  });

  it("refuses a challenge that is not in the organization", async () => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    challengeTable.rows = [];
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge)), SETTINGS, "Start verification again.");
  });

  it("refuses a stored challenge on an unsupported chain", async () => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    challengeTable.rows = [{ ...challengeTable.rows[0]!, chain: "bitcoin" }];
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge)), SETTINGS, "Start verification again.");
  });

  it("refuses a challenge for a company outside the user's scope", async () => {
    signInLive("viewer", { entityScope: [MY] });
    const challenge = await issuedChallenge();
    challengeTable.rows = [{ ...challengeTable.rows[0]!, entityId: SG }];
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge)), SETTINGS, OUTSIDE_ACCESS);
  });

  it.each([
    [{ name: "" }, "Name the wallet."],
    [{ name: "x".repeat(201) }, "Name the wallet."],
    [{ role: "trading" }, "Choose hot, cold, or staking."],
    [{ signature: "  " }, "The wallet did not sign."],
  ])("refuses %o", async (fields, message) => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge, fields)), SETTINGS, message);
  });

  it("shows a write error, such as a challenge consumed in a race", async () => {
    signInLive("viewer");
    const challenge = await issuedChallenge();
    vi.mocked(insertConnection).mockRejectedValue(new BooksWriteError("This verification was already used."));
    await expectError(verifyWalletOwnershipAction(verifyForm(challenge)), SETTINGS, "This verification was already used.");
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(verifyWalletOwnershipAction(verifyForm({ challengeId: "own_x", signature: "0x00" })), SETTINGS, READ_ONLY);
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("viewer");
    await expectError(
      verifyWalletOwnershipAction(form({ challengeId: "own_x", signature: "0x00", name: "n", role: "hot" }, { csrf: "stale" })),
      SETTINGS,
      FORM_EXPIRED,
    );
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("viewer");
    await expectError(verifyWalletOwnershipAction(verifyForm({ challengeId: "own_x", signature: "0x00" })), SETTINGS, CROSS_SITE);
  });

  it("sends a signed-out visitor to sign in", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    expect((await redirectOf(verifyWalletOwnershipAction(verifyForm({ challengeId: "own_x", signature: "0x00" })))).pathname).toBe("/sign-in");
  });
});
