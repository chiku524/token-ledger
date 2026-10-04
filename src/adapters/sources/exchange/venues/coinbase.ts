/**
 * Coinbase venue, read-only (Coinbase App API v2).
 *
 * Two credential shapes:
 * - OAuth: access token (apiKey) + `tl-oauth:` refresh token (apiSecret) → Bearer
 * - CDP API key: key name (apiKey) + ECDSA private key PEM (apiSecret) → per-request JWT
 *
 * Reads accounts and recent transactions. Never calls a send or trade endpoint.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { OAUTH_SECRET_PREFIX } from "@/auth/exchange-oauth";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";
import { looksLikeCoinbasePrivateKey, signCoinbaseJwt } from "./coinbase-jwt";

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
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** OAuth access token, including legacy connections stored without the prefix. */
  private get oauth(): boolean {
    if (this.credential.apiSecret.startsWith(OAUTH_SECRET_PREFIX)) return true;
    return !looksLikeCoinbasePrivateKey(this.credential.apiSecret);
  }

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { "CB-VERSION": "2024-10-01" };
    if (this.oauth) {
      headers.Authorization = `Bearer ${this.credential.apiKey}`;
    } else {
      try {
        const token = signCoinbaseJwt({
          apiKey: this.credential.apiKey,
          privateKey: this.credential.apiSecret,
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
      return await requestJson<T>(this.fetchImpl, `${this.baseUrl}${path}`, { headers });
    } catch (error) {
      if (error instanceof ExchangeHttpError && error.kind === "auth") {
        throw new ExchangeHttpError(
          this.oauth
            ? "Coinbase rejected the connection. Connect again to refresh access."
            : "Coinbase rejected the API key. Use a CDP ECDSA key with view access, or connect with OAuth.",
          "auth",
          error.status,
        );
      }
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
    await this.get<{ data?: unknown[] }>("/v2/accounts?limit=1");
  }
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
