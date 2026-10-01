/**
 * QuickBooks Online OAuth 2.0 and the journal client.
 *
 * Endpoints are the standard Intuit ones. Tokens are short-lived and
 * refreshable; the caller stores them sealed. This module builds URLs and
 * exchanges tokens only.
 * See docs/adr-accounting-sync.md.
 */
import { AccountingError, callJson } from "./http";

export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_API_BASE = "https://quickbooks.api.intuit.com/v3/company";
export const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company";

export const QBO_SCOPES = ["com.intuit.quickbooks.accounting"] as const;

export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  /** The connected company (realm) id. */
  realmId: string;
}

export interface QboOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildQboAuthorizeUrl(config: QboOAuthConfig, state: string, sandbox = false): string {
  const query = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: QBO_SCOPES.join(" "),
    redirect_uri: config.redirectUri,
    state,
  });
  void sandbox;
  return `${QBO_AUTHORIZE_URL}?${query.toString()}`;
}

function basicAuth(config: QboOAuthConfig): Record<string, string> {
  const encoded = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
}

interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function toTokens(body: QboTokenResponse, realmId: string): QboTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    realmId,
  };
}

export async function exchangeQboCode(
  config: QboOAuthConfig,
  code: string,
  realmId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<QboTokens> {
  const { data } = await callJson<QboTokenResponse>(fetchImpl, {
    url: QBO_TOKEN_URL,
    method: "POST",
    headers: basicAuth(config),
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri }).toString(),
  });
  return toTokens(data, realmId);
}

export async function refreshQboToken(
  config: QboOAuthConfig,
  refreshToken: string,
  realmId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<QboTokens> {
  const { data } = await callJson<QboTokenResponse>(fetchImpl, {
    url: QBO_TOKEN_URL,
    method: "POST",
    headers: basicAuth(config),
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  return toTokens(data, realmId);
}

export interface QboPostResult {
  id: string;
  status: number;
}

/** Create one journal entry. `requestid` makes the retry idempotent. */
export async function postQboJournalEntry(
  tokens: QboTokens,
  body: unknown,
  requestId: string,
  options: { sandbox?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<QboPostResult> {
  if (!tokens.realmId) throw new AccountingError("A QuickBooks realm id is required.", "api");
  const base = options.sandbox ? QBO_SANDBOX_BASE : QBO_API_BASE;
  const { status, data } = await callJson<{ JournalEntry?: { Id?: string } }>(options.fetchImpl ?? fetch, {
    url: `${base}/${tokens.realmId}/journalentry?requestid=${encodeURIComponent(requestId)}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return { id: data.JournalEntry?.Id ?? requestId, status };
}
