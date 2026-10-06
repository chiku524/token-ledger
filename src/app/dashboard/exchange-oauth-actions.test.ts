import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, readOauthState } from "@/auth/exchange-oauth";
import {
  cookieJar,
  CROSS_SITE,
  expectError,
  form,
  FORM_EXPIRED,
  MY,
  NO_PERMISSION,
  ORG,
  redirectOf,
  resetRequest,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import { startExchangeOauthAction } from "./exchange-oauth-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

const SECRET = "test-auth-secret-that-is-at-least-32-chars";
const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";
const SETTINGS = "/dashboard/settings";

beforeEach(() => {
  resetRequest();
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("COINBASE_CLIENT_ID", "cb-client");
  vi.stubEnv("COINBASE_CLIENT_SECRET", "cb-secret");
  vi.stubEnv("GEMINI_CLIENT_ID", "");
  vi.stubEnv("GEMINI_CLIENT_SECRET", "");
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("startExchangeOauthAction", () => {
  it("sets a signed state cookie and sends the browser to the exchange", async () => {
    const user = signInLive("admin");
    const result = await redirectOf(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY, next: "/dashboard/sources" })));
    expect(result.external).toBe(true);
    const target = new URL(result.url);
    expect(`${target.origin}${target.pathname}`).toBe("https://login.coinbase.com/oauth2/auth");
    expect(target.searchParams.get("client_id")).toBe("cb-client");
    expect(target.searchParams.get("redirect_uri")).toBe("https://ledger.test/api/connect/exchange/callback");
    expect(target.searchParams.get("scope")).toBe("wallet:accounts:read,wallet:transactions:read");

    const [name, token, options] = vi.mocked(cookieJar.set).mock.calls.find(([cookie]) => cookie === OAUTH_STATE_COOKIE)!;
    expect(name).toBe(OAUTH_STATE_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, maxAge: OAUTH_STATE_TTL_MS / 1000 });
    const state = readOauthState(token, SECRET);
    expect(state).toMatchObject({ sessionId: user.id, organizationId: ORG, entityId: MY, venue: "coinbase" });
    expect(state?.nonce).toBe(target.searchParams.get("state"));
  });

  it("refuses an exchange that does not use OAuth", async () => {
    signInLive("admin");
    await expectError(startExchangeOauthAction(form({ venue: "kraken", entityId: MY })), SETTINGS, "That exchange does not connect with OAuth.");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("points to an API key when the OAuth client is not configured", async () => {
    signInLive("admin");
    await expectError(
      startExchangeOauthAction(form({ venue: "gemini", entityId: MY, next: "/dashboard/setup?step=exchange" })),
      "/dashboard/setup",
      "Gemini OAuth is not configured yet. Use a read-only API key instead.",
    );
  });

  it.each(["accountant", "approver", "viewer"] as const)("refuses a %s", async (role) => {
    signInLive(role);
    await expectError(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY })), SETTINGS, NO_PERMISSION);
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY })), SETTINGS, READ_ONLY);
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("admin");
    await expectError(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY }, { csrf: "stale" })), SETTINGS, FORM_EXPIRED);
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("admin");
    await expectError(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY })), SETTINGS, CROSS_SITE);
  });

  it("falls back to Settings for an unknown return path", async () => {
    signInLive("viewer");
    await expectError(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY, next: "//evil.example" })), SETTINGS, NO_PERMISSION);
  });

  it("sends a signed-out visitor to sign in", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    expect((await redirectOf(startExchangeOauthAction(form({ venue: "coinbase", entityId: MY })))).pathname).toBe("/sign-in");
  });
});
