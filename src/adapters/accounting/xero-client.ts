/**
 * Xero OAuth 2.0 (authorization code) and the read/write client.
 *
 * Endpoints are the standard Xero identity ones. Tokens are short-lived and
 * refreshable; the caller stores them sealed. This module only builds URLs and
 * exchanges tokens — it never persists anything.
 * See docs/adr-accounting-sync.md.
 */
import { AccountingError, callJson } from "./http";

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

/** Scopes needed to read accounts and post manual journals. */
export const XERO_SCOPES = [
  "offline_access",
  "accounting.settings.read",
  "accounting.transactions",
] as const;

export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface XeroOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildXeroAuthorizeUrl(config: XeroOAuthConfig, state: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: XERO_SCOPES.join(" "),
    state,
  });
  return `${XERO_AUTHORIZE_URL}?${query.toString()}`;
}

function basicAuth(config: XeroOAuthConfig): Record<string, string> {
  const encoded = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/x-www-form-urlencoded" };
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function toTokens(body: XeroTokenResponse): XeroTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

export async function exchangeXeroCode(
  config: XeroOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XeroTokens> {
  const { data } = await callJson<XeroTokenResponse>(fetchImpl, {
    url: XERO_TOKEN_URL,
    method: "POST",
    headers: basicAuth(config),
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri }).toString(),
  });
  return toTokens(data);
}

export async function refreshXeroToken(
  config: XeroOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XeroTokens> {
  const { data } = await callJson<XeroTokenResponse>(fetchImpl, {
    url: XERO_TOKEN_URL,
    method: "POST",
    headers: basicAuth(config),
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  return toTokens(data);
}

/** The Xero organisations this token can access, with the tenant id to send. */
export async function listXeroConnections(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const { data } = await callJson<Array<{ tenantId: string; tenantName: string }>>(fetchImpl, {
    url: XERO_CONNECTIONS_URL,
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  return data.map((row) => ({ tenantId: row.tenantId, tenantName: row.tenantName }));
}

export interface XeroPostResult {
  id: string;
  status: number;
}

/** Post one manual journal, idempotent via the `Idempotency-Key` header. */
export async function postXeroManualJournal(
  accessToken: string,
  tenantId: string,
  body: unknown,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XeroPostResult> {
  if (!tenantId) throw new AccountingError("A Xero tenant id is required.", "api");
  const { status, data } = await callJson<{ ManualJournals?: Array<{ ManualJournalID?: string }> }>(fetchImpl, {
    url: `${XERO_API_BASE}/ManualJournals`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  return { id: data.ManualJournals?.[0]?.ManualJournalID ?? idempotencyKey, status };
}
