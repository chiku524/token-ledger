import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleBooks } from "@/data/example-books";
import { insertWalletBinding, WalletBindingError } from "@/db/wallet-bindings";
import {
  actorOf,
  challengeTable,
  CROSS_SITE,
  expectError,
  form,
  FORM_EXPIRED,
  MY,
  NO_PERMISSION,
  ORG,
  RedirectSignal,
  parseRedirect,
  redirectOf,
  resetRequest,
  SG,
  signInDemo,
  signInLive,
  type Redirect,
} from "@/test/server-harness";
import { issueBindingChallenge, verifyWalletBindingAction } from "./binding-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/client", async () => (await import("@/test/server-harness")).dbClientMock);
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/wallet-bindings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/wallet-bindings")>()),
  insertWalletBinding: vi.fn(async () => undefined),
}));

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";
const NOT_CONFIGURED = "The contract features are not configured on this deployment.";
const SETTINGS = "/dashboard/settings";

const secretKey = new Uint8Array(32).fill(7);
const walletAddress = base58.encode(ed25519.getPublicKey(secretKey));
const programAddress = (seed: number) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(seed)));

function configureContracts(cluster = "devnet"): void {
  vi.stubEnv("SOLANA_CONTRACTS_CLUSTER", cluster);
  vi.stubEnv("SERVICE_BALANCE_PROGRAM_ID", programAddress(1));
  vi.stubEnv("TREASURY_PAYABLES_PROGRAM_ID", programAddress(2));
  vi.stubEnv("USDC_MINT", programAddress(3));
  vi.stubEnv("SOLANA_RPC_URL", "");
  vi.stubEnv("SPL_TOKEN_PROGRAM_ID", "");
}

function sign(message: string, key = secretKey): string {
  return base58.encode(ed25519.sign(new TextEncoder().encode(message), key));
}

async function issuedChallenge(): Promise<{ challengeId: string; message: string }> {
  const issued = await issueBindingChallenge(form({ entityId: MY, address: walletAddress }));
  if ("error" in issued) throw new Error(issued.error);
  challengeTable.rows = [{ ...challengeTable.inserted[0]!, consumedAt: null }];
  return issued;
}

async function settle(run: Promise<unknown>): Promise<Redirect | undefined> {
  try {
    await run;
    return undefined;
  } catch (error) {
    if (error instanceof RedirectSignal) return parseRedirect(error.url);
    throw error;
  }
}

beforeEach(() => {
  resetRequest();
  configureContracts();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("issueBindingChallenge", () => {
  it("binds the challenge to the user, session, company, cluster, and site", async () => {
    const user = signInLive("admin");
    const issued = await issuedChallenge();
    expect(issued.challengeId).toMatch(/^bind_[0-9a-f]{16}$/);
    expect(issued.message).toContain(walletAddress);
    expect(challengeTable.inserted[0]).toMatchObject({
      id: issued.challengeId,
      organizationId: ORG,
      userId: user.id,
      sessionId: user.id,
      entityId: MY,
      cluster: "devnet",
      address: walletAddress,
      domain: "ledger.test",
    });
  });

  it.each(["accountant", "approver", "viewer"] as const)("refuses a %s", async (role) => {
    signInLive(role);
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }))).toEqual({ error: NO_PERMISSION });
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }))).toEqual({ error: READ_ONLY });
  });

  it("is off when the contracts are not configured", async () => {
    vi.stubEnv("SOLANA_CONTRACTS_CLUSTER", "");
    signInLive("owner");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }))).toEqual({ error: NOT_CONFIGURED });
  });

  it.each([
    [{ address: "0x0000000000000000000000000000000000000001" }, "That address is not a Solana address."],
    [{ entityId: "ent_other" }, "Choose a company in this organization."],
  ])("refuses %o", async (fields, error) => {
    signInLive("owner");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress, ...fields }))).toEqual({ error });
    expect(challengeTable.inserted).toHaveLength(0);
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("owner");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }, { csrf: "stale" }))).toEqual({ error: FORM_EXPIRED });
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    configureContracts();
    signInLive("owner");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }))).toEqual({ error: CROSS_SITE });
  });

  it("returns a generic error when the challenge cannot be stored", async () => {
    signInLive("owner");
    challengeTable.insertError = new Error("relation does not exist");
    expect(await issueBindingChallenge(form({ entityId: MY, address: walletAddress }))).toEqual({ error: "Could not start wallet binding." });
  });
});

describe("verifyWalletBindingAction", () => {
  it("writes the binding from a real signature", async () => {
    const user = signInLive("admin");
    const challenge = await issuedChallenge();
    const result = await settle(verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message) })));
    expect(result?.params.get("error") ?? null).toBeNull();
    expect(insertWalletBinding).toHaveBeenCalledWith(
      exampleBooks,
      { entityId: MY, userId: user.id, challengeId: challenge.challengeId, cluster: "devnet", walletAddress },
      actorOf(user),
    );
  });

  // Known bug: success returns without finish(), so there is no saved notice and no revalidation.
  it.fails("confirms success with a saved notice", async () => {
    signInLive("admin");
    const challenge = await issuedChallenge();
    const result = await redirectOf(verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message) })));
    expect(result.params.get("saved")).toBeTruthy();
  });

  // Known bug: `next` is used as the redirect target without connectionReturnPath, so it can leave the site.
  it.fails("keeps the redirect on this site when next is external", async () => {
    signInLive("admin");
    const result = await redirectOf(
      verifyWalletBindingAction(form({ next: "https://evil.example/phish", challengeId: "bind_x", signature: "s" }, { csrf: "stale" })),
    );
    expect(result.external).toBe(false);
  });

  // Known bug: save() turns WalletBindingError into the generic message before the outer catch sees it.
  it.fails("shows a WalletBindingError message", async () => {
    signInLive("admin");
    const challenge = await issuedChallenge();
    vi.mocked(insertWalletBinding).mockRejectedValue(new WalletBindingError("This verification was already used."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expectError(
      verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message) })),
      SETTINGS,
      "This verification was already used.",
    );
  });

  it("refuses a signature from another key", async () => {
    signInLive("admin");
    const challenge = await issuedChallenge();
    await expectError(
      verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message, new Uint8Array(32).fill(9)) })),
      SETTINGS,
      "The signature does not match this address.",
    );
    expect(insertWalletBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["already used", { consumedAt: new Date() }, "This verification was already used."],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }, "This verification expired. Start again."],
    ["from another sign-in", { sessionId: "user_other" }, "This verification is for a different sign-in."],
    ["for another cluster", { cluster: "mainnet-beta" }, "This verification is for a different cluster."],
    ["for another site", { domain: "evil.example" }, "This verification is for a different site."],
  ])("refuses a challenge %s", async (_label, change, message) => {
    signInLive("admin");
    const challenge = await issuedChallenge();
    challengeTable.rows = [{ ...challengeTable.rows[0]!, ...change }];
    await expectError(verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message) })), SETTINGS, message);
    expect(insertWalletBinding).not.toHaveBeenCalled();
  });

  it("refuses a challenge that is not in the organization", async () => {
    signInLive("admin");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_missing", signature: "s" })), SETTINGS, "Start the binding again.");
  });

  it("does not narrow an admin by entity scope", async () => {
    signInLive("admin", { entityScope: [SG] });
    const challenge = await issuedChallenge();
    const result = await settle(verifyWalletBindingAction(form({ challengeId: challenge.challengeId, signature: sign(challenge.message) })));
    expect(result?.params.get("error") ?? null).toBeNull();
    expect(insertWalletBinding).toHaveBeenCalledTimes(1);
  });

  it("requires a signature", async () => {
    signInLive("admin");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_x", signature: " " })), SETTINGS, "The wallet did not sign.");
  });

  it("is off when the contracts are not configured", async () => {
    vi.stubEnv("SOLANA_CONTRACTS_CLUSTER", "");
    signInLive("admin");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_x", signature: "s" })), SETTINGS, NOT_CONFIGURED);
  });

  it("refuses an accountant", async () => {
    signInLive("accountant");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_x", signature: "s" })), SETTINGS, NO_PERMISSION);
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_x", signature: "s" })), SETTINGS, READ_ONLY);
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("admin");
    await expectError(verifyWalletBindingAction(form({ challengeId: "bind_x", signature: "s" }, { csrf: "stale" })), SETTINGS, FORM_EXPIRED);
  });
});
