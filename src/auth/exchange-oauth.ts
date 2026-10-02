import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Exchanges that CoinStats connects with an Allow-access redirect. */
export const OAUTH_EXCHANGES = ["coinbase", "bybit"] as const;
export type OauthExchange = (typeof OAUTH_EXCHANGES)[number];

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_COOKIE = "tl_exchange_oauth";

const COINBASE_AUTHORIZE = "https://login.coinbase.com/oauth2/auth";
const COINBASE_TOKEN = "https://login.coinbase.com/oauth2/token";
const COINBASE_SCOPES = "wallet:accounts:read,wallet:transactions:read";
const BYBIT_AUTHORIZE = "https://www.bybit.com/en/oauth";
const BYBIT_TOKEN = "https://api2.bybit.com/oauth/v1/public/access_token";
const BYBIT_OPENAPI = "https://api2.bybit.com/oauth/v1/resource/restrict/openapi";

export interface OauthClient {
  clientId: string;
  clientSecret: string;
}

export interface OauthState {
  nonce: string;
  sessionId: string;
  organizationId: string;
  entityId: string;
  venue: OauthExchange;
  exp: number;
}

export function isOauthExchange(value: string): value is OauthExchange {
  return (OAUTH_EXCHANGES as readonly string[]).includes(value);
}

/** Coinbase opens on OAuth. Bybit opens on the API key, with OAuth next to it. */
export function oauthDefaultTab(venue: OauthExchange): "oauth" | "api" {
  return venue === "coinbase" ? "oauth" : "api";
}

export function readOauthClient(
  venue: OauthExchange,
  env: Record<string, string | undefined> = process.env,
): OauthClient | null {
  const idName = venue === "coinbase" ? "COINBASE_CLIENT_ID" : "BYBIT_OAUTH_CLIENT_ID";
  const secretName = venue === "coinbase" ? "COINBASE_CLIENT_SECRET" : "BYBIT_OAUTH_CLIENT_SECRET";
  const clientId = env[idName]?.trim() ?? "";
  const clientSecret = env[secretName]?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function exchangeCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/connect/exchange/callback`;
}

export function originFromHeaders(headerList: { get(name: string): string | null }): string | null {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return null;
  const proto = (headerList.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  return `${proto}://${host.split(",")[0]?.trim()}`;
}

export function buildExchangeAuthorizeUrl(input: {
  venue: OauthExchange;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  if (input.venue === "coinbase") {
    params.set("scope", COINBASE_SCOPES);
    return `${COINBASE_AUTHORIZE}?${params.toString()}`;
  }
  params.set("scope", "openapi");
  return `${BYBIT_AUTHORIZE}?${params.toString()}`;
}

export function newOauthNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signOauthState(state: OauthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readOauthState(token: string, secret: string, now = Date.now()): OauthState | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OauthState;
    if (!parsed.nonce || !parsed.sessionId || !parsed.organizationId || !parsed.entityId) return null;
    if (!isOauthExchange(parsed.venue)) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface OauthCredential {
  apiKey: string;
  apiSecret: string;
}

/**
 * Turn an authorization code into a sealed-ready credential.
 * Bybit returns a read-only API key. Coinbase returns an access token and a refresh token.
 */
export async function exchangeAuthorizationCode(input: {
  venue: OauthExchange;
  client: OauthClient;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<OauthCredential> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (input.venue === "bybit") return exchangeBybit(input.client, input.code, fetchImpl);
  return exchangeCoinbase(input.client, input.code, input.redirectUri, fetchImpl);
}

/** Refresh a Coinbase access token. Returns null when Coinbase refuses. */
export async function refreshCoinbaseAccessToken(
  refreshToken: string,
  client: OauthClient,
  fetchImpl: typeof fetch = fetch,
): Promise<OauthCredential | null> {
  try {
    const json = await postForm(fetchImpl, COINBASE_TOKEN, new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }));
    const access = stringField(json, "access_token");
    if (!access) return null;
    return { apiKey: access, apiSecret: stringField(json, "refresh_token") ?? refreshToken };
  } catch {
    return null;
  }
}

async function exchangeCoinbase(
  client: OauthClient,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<OauthCredential> {
  const json = await postForm(fetchImpl, COINBASE_TOKEN, new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
  }));
  const access = stringField(json, "access_token");
  const refresh = stringField(json, "refresh_token");
  if (!access || !refresh) throw new Error("Coinbase did not return a token.");
  return { apiKey: access, apiSecret: refresh };
}

async function exchangeBybit(client: OauthClient, code: string, fetchImpl: typeof fetch): Promise<OauthCredential> {
  const token = await postForm(fetchImpl, BYBIT_TOKEN, new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
  }));
  const access = stringField(token, "access_token");
  if (!access) throw new Error("Bybit did not return a token.");
  const response = await fetchImpl(BYBIT_OPENAPI, { headers: { Authorization: `Bearer ${access}` } });
  const text = await response.text();
  if (!response.ok) throw new Error("Bybit did not return a read-only key.");
  const json = JSON.parse(text) as { ret_code?: number; result?: { api_key?: string; api_secret?: string } };
  const apiKey = json.result?.api_key;
  const apiSecret = json.result?.api_secret;
  if (json.ret_code !== 0 || !apiKey || !apiSecret) throw new Error("Bybit did not return a read-only key.");
  return { apiKey, apiSecret };
}

async function postForm(fetchImpl: typeof fetch, url: string, body: URLSearchParams): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error("The exchange refused the authorization code.");
  return JSON.parse(text) as unknown;
}

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : null;
}
