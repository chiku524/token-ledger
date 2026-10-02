/**
 * Coinbase venue, read-only (Coinbase App API v2).
 *
 * The credential is an OAuth access token (apiKey) and refresh token (apiSecret).
 * Reads accounts and recent transactions. Never calls a send or trade endpoint.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

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

  private async get<T>(path: string): Promise<T> {
    try {
      return await requestJson<T>(this.fetchImpl, `${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.credential.apiKey}`,
          "CB-VERSION": "2024-10-01",
        },
      });
    } catch (error) {
      if (error instanceof ExchangeHttpError && error.kind === "auth") {
        throw new ExchangeHttpError("Coinbase rejected the connection. Connect again to refresh access.", "auth", error.status);
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
  keyUrl: "https://www.coinbase.com/settings/api",
  scopes: ["wallet:accounts:read", "wallet:transactions:read"],
  create(credential, options = {}) {
    return new CoinbaseConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
