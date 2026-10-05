/**
 * Coinbase venue, read-only (Coinbase App API v2).
 *
 * Two credential shapes:
 * - OAuth: access token (apiKey) + `tl-oauth:` refresh token (apiSecret) → Bearer
 * - CDP API key: key name (apiKey) + ECDSA PEM or Ed25519 base64 secret → per-request JWT
 *
 * Reads accounts and recent transactions. Never calls a send or trade endpoint.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { OAUTH_SECRET_PREFIX } from "@/auth/exchange-oauth";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestText } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";
import { isCoinbaseApiKeySecret, parseCoinbaseCredentialParts, signCoinbaseJwt } from "./coinbase-jwt";

const BASE = "https://api.coinbase.com";

interface CoinbaseAccount {
  id: string;
  balance?: { amount?: string; currency?: string };
}

interface CoinbaseTransaction {
  id: string;
  amount?: { amount?: string; currency?: string };
  created_at?: string;
  description?: string | null;
}

class CoinbaseConnector implements VenueConnector {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {
    const parts = parseCoinbaseCredentialParts(credential.apiKey, credential.apiSecret);
    this.apiKey = parts.apiKey;
    this.apiSecret = parts.apiSecret;
  }

  /**
   * OAuth when the secret is marked (or legacy refresh without a PEM/Ed25519 shape).
   * CDP API-key secrets must never fall through to Bearer(apiKey).
   */
  private get oauth(): boolean {
    if (this.apiSecret.startsWith(OAUTH_SECRET_PREFIX)) return true;
    if (isCoinbaseApiKeySecret(this.apiSecret)) return false;
    // CDP key names with an unrecognised secret are a paste error, not OAuth.
    if (looksLikeCoinbaseKeyName(this.apiKey)) {
      throw new ExchangeHttpError(
        "Coinbase API secret must be an ECDSA PEM or Ed25519 base64 secret from the CDP portal (or paste the downloaded JSON key file).",
        "auth",
      );
    }
    // Short legacy HMAC keys expired in 2025.
    if (this.apiKey.length <= 32) {
      throw new ExchangeHttpError(
        "Legacy Coinbase API keys expired in 2025. Create a CDP Secret API key instead.",
        "auth",
      );
    }
    // Legacy OAuth refresh tokens stored without the tl-oauth: prefix.
    return true;
  }

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "CB-VERSION": "2024-10-01",
    };
    const oauth = this.oauth;
    if (oauth) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    } else {
      try {
        const token = signCoinbaseJwt({
          apiKey: this.apiKey,
          privateKey: this.apiSecret,
          method: "GET",
          requestPath: path,
        });
        headers.Authorization = `Bearer ${token}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Coinbase rejected the credential.";
        throw new ExchangeHttpError(message, "auth");
      }
    }
    try {
      const { status, text } = await requestText(this.fetchImpl, `${this.baseUrl}${path}`, { headers });
      if (status === 401 || status === 403) {
        const hint = safeCoinbaseErrorHint(text);
        console.warn(
          `coinbase.auth_rejected status=${status} mode=${oauth ? "oauth" : "api_key"} hint=${hint ?? "none"}`,
        );
        throw new ExchangeHttpError(
          oauth
            ? `Coinbase rejected the connection (HTTP ${status}). Connect again to refresh access.`
            : `Coinbase rejected the API key (HTTP ${status}).${hint ? ` ${hint}` : " Check the CDP key name (organizations/…/apiKeys/…) and secret, view permission, and IP allowlist."}`,
          "auth",
          status,
        );
      }
      if (status === 429) {
        throw new ExchangeHttpError("The exchange rate limit was hit.", "rate", status);
      }
      if (status < 200 || status >= 300) {
        throw new ExchangeHttpError(`Exchange returned HTTP ${status}.`, "http", status);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ExchangeHttpError("Exchange returned a non-JSON response.", "api", status);
      }
    } catch (error) {
      if (error instanceof ExchangeHttpError) throw error;
      throw error;
    }
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const body = await this.get<{ data?: CoinbaseAccount[] }>("/v2/accounts?limit=100");
    const rows = new Map<string, bigint>();
    for (const account of body.data ?? []) {
      const code = account.balance?.currency;
      const amount = account.balance?.amount;
      if (!code || !amount) continue;
      const minor = toMinorUnits(amount, decimalsFor(code));
      if (minor === 0n) continue;
      rows.set(code, (rows.get(code) ?? 0n) + minor);
    }
    return [...rows].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const accounts = await this.get<{ data?: CoinbaseAccount[] }>("/v2/accounts?limit=25");
    const movements: NormalizedSourceTransaction[] = [];
    for (const account of (accounts.data ?? []).slice(0, 25)) {
      const body = await this.get<{ data?: CoinbaseTransaction[] }>(`/v2/accounts/${account.id}/transactions?limit=25`);
      for (const row of body.data ?? []) {
        const code = row.amount?.currency;
        const amount = row.amount?.amount;
        const occurredOn = row.created_at?.slice(0, 10);
        if (!code || !amount || !occurredOn || !row.id) continue;
        const negative = amount.trim().startsWith("-");
        movements.push({
          externalId: `coinbase-${row.id}`,
          occurredOn,
          assetCode: code,
          direction: negative ? "out" : "in",
          quantityMinor: toMinorUnits(negative ? amount.slice(1) : amount, decimalsFor(code)),
          description: row.description?.trim() || "Coinbase transaction.",
          chain: "coinbase",
        });
      }
    }
    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    // Path without query keeps the JWT uri claim simple; pagination is unused for verify.
    await this.get<{ data?: unknown[] }>("/v2/accounts");
  }
}

function looksLikeCoinbaseKeyName(apiKey: string): boolean {
  return apiKey.includes("/apiKeys/") || apiKey.startsWith("organizations/");
}

/** Short, non-sensitive Coinbase error text for the user. Never returns token-like values. */
export function safeCoinbaseErrorHint(body: string): string | null {
  try {
    const json = JSON.parse(body) as {
      message?: unknown;
      error?: unknown;
      error_description?: unknown;
      errors?: Array<{ message?: unknown; id?: unknown }>;
    };
    const candidates = [
      typeof json.message === "string" ? json.message : null,
      typeof json.error_description === "string" ? json.error_description : null,
      typeof json.error === "string" ? json.error : null,
      typeof json.errors?.[0]?.message === "string" ? json.errors[0].message : null,
      typeof json.errors?.[0]?.id === "string" ? json.errors[0].id : null,
    ].filter((value): value is string => Boolean(value?.trim()));
    for (const candidate of candidates) {
      const text = candidate.trim();
      if (text.length === 0 || text.length > 160) continue;
      if (/bearer|eyJ|BEGIN |private|secret|api[_-]?key/i.test(text)) continue;
      return text.endsWith(".") ? text : `${text}.`;
    }
  } catch {
    // ignore non-JSON
  }
  return null;
}

export const coinbaseVenue: VenueDefinition = {
  key: "coinbase",
  label: "Coinbase",
  summary: "Read-only balances and transactions from a Coinbase account.",
  keyUrl: "https://portal.cdp.coinbase.com/projects/api-keys",
  scopes: ["wallet:accounts:read", "wallet:transactions:read"],
  create(credential, options = {}) {
    return new CoinbaseConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
