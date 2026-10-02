import { describe, expect, it } from "vitest";
import {
  buildExchangeAuthorizeUrl,
  exchangeAuthorizationCode,
  oauthDefaultTab,
  readOauthState,
  refreshCoinbaseAccessToken,
  signOauthState,
  type OauthState,
} from "./exchange-oauth";

const SECRET = "x".repeat(32);

function state(overrides: Partial<OauthState> = {}): OauthState {
  return {
    nonce: "nonce-1",
    sessionId: "session-1",
    organizationId: "org-1",
    entityId: "ent-1",
    venue: "coinbase",
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

describe("exchange oauth", () => {
  it("opens Coinbase on OAuth and Bybit on the API key", () => {
    expect(oauthDefaultTab("coinbase")).toBe("oauth");
    expect(oauthDefaultTab("bybit")).toBe("api");
  });

  it("builds the Coinbase and Bybit allow-access URLs", () => {
    const coinbase = new URL(buildExchangeAuthorizeUrl({
      venue: "coinbase",
      clientId: "cb-id",
      redirectUri: "https://app.example/api/connect/exchange/callback",
      state: "state-1",
    }));
    expect(coinbase.origin + coinbase.pathname).toBe("https://login.coinbase.com/oauth2/auth");
    expect(coinbase.searchParams.get("scope")).toContain("wallet:accounts:read");
    expect(coinbase.searchParams.get("response_type")).toBe("code");

    const bybit = new URL(buildExchangeAuthorizeUrl({
      venue: "bybit",
      clientId: "by-id",
      redirectUri: "https://app.example/api/connect/exchange/callback",
      state: "state-1",
    }));
    expect(bybit.origin + bybit.pathname).toBe("https://www.bybit.com/en/oauth");
    expect(bybit.searchParams.get("scope")).toBe("openapi");
  });

  it("rejects a tampered, expired, or replayed-looking state", () => {
    const token = signOauthState(state(), SECRET);
    expect(readOauthState(token, SECRET)?.nonce).toBe("nonce-1");
    expect(readOauthState(token, "y".repeat(32))).toBeNull();
    expect(readOauthState(`${token}x`, SECRET)).toBeNull();
    expect(readOauthState(signOauthState(state({ exp: Date.now() - 1 }), SECRET), SECRET)).toBeNull();
    expect(readOauthState(signOauthState(state({ venue: "kraken" as "coinbase" }), SECRET), SECRET)).toBeNull();
  });

  it("turns a Bybit code into a read-only API key and a Coinbase code into tokens", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("restrict/openapi")) {
        return new Response(JSON.stringify({ ret_code: 0, result: { api_key: "key", api_secret: "secret" } }), { status: 200 });
      }
      if (href.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "bearer" }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh" }), { status: 200 });
    }) as typeof fetch;

    await expect(exchangeAuthorizationCode({
      venue: "bybit",
      client: { clientId: "id", clientSecret: "secret" },
      code: "code",
      redirectUri: "https://app.example/callback",
      fetchImpl,
    })).resolves.toEqual({ apiKey: "key", apiSecret: "secret" });

    await expect(exchangeAuthorizationCode({
      venue: "coinbase",
      client: { clientId: "id", clientSecret: "secret" },
      code: "code",
      redirectUri: "https://app.example/callback",
      fetchImpl,
    })).resolves.toEqual({ apiKey: "access", apiSecret: "refresh" });
  });

  it("refreshes a Coinbase access token and keeps the old refresh token when none is returned", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ access_token: "next" }), { status: 200 })) as typeof fetch;
    await expect(refreshCoinbaseAccessToken("refresh", { clientId: "id", clientSecret: "secret" }, fetchImpl)).resolves.toEqual({
      apiKey: "next",
      apiSecret: "refresh",
    });
  });
});
