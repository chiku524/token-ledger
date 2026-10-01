/**
 * Bybit venue, read-only (v5 API). HMAC-SHA256 signing.
 *
 * Reads the unified and funding balances, deposits, withdrawals, and recent
 * trades. Never calls an order or withdraw endpoint.
 */
import { createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.bybit.com";
const RECV_WINDOW = "5000";

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

class BybitConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private sign(query: string): { query: string; headers: Record<string, string> } {
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", this.credential.apiSecret)
      .update(timestamp + this.credential.apiKey + RECV_WINDOW + query)
      .digest("hex");
    return {
      query,
      headers: {
        "X-BAPI-API-KEY": this.credential.apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "X-BAPI-SIGN": signature,
      },
    };
  }

  private async signedGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const { headers } = this.sign(query);
    let envelope: BybitEnvelope<T>;
    try {
      envelope = await requestJson<BybitEnvelope<T>>(this.fetchImpl, `${this.baseUrl}${path}?${query}`, { headers });
    } catch (error) {
      if (error instanceof ExchangeHttpError) throw error;
      throw new ExchangeHttpError("Bybit request failed.", "network");
    }
    if (envelope.retCode === 10003 || envelope.retCode === 10004) {
      throw new ExchangeHttpError(`Bybit rejected the credential: ${envelope.retMsg}`, "auth");
    }
    if (envelope.retCode === 10006) {
      throw new ExchangeHttpError(`Bybit rate limit: ${envelope.retMsg}`, "rate");
    }
    if (envelope.retCode !== 0) {
      throw new ExchangeHttpError(`Bybit error: ${envelope.retMsg}`, "api");
    }
    return envelope.result;
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const rows = new Map<string, bigint>();

    const unified = await this.signedGet<{ list: Array<{ coin: Array<{ coin: string; walletBalance: string }> }> }>(
      "/v5/account/wallet-balance",
      { accountType: "UNIFIED" },
    );
    for (const account of unified.list) {
      for (const coin of account.coin) {
        const amount = toMinorUnits(coin.walletBalance || "0", decimalsFor(coin.coin));
        rows.set(coin.coin, (rows.get(coin.coin) ?? 0n) + amount);
      }
    }

    const funding = await this.signedGet<{ balance: Array<{ coin: string; walletBalance: string }> }>(
      "/v5/asset/transfer/query-account-coins-balance",
      { accountType: "FUND" },
    );
    for (const coin of funding.balance ?? []) {
      const amount = toMinorUnits(coin.walletBalance || "0", decimalsFor(coin.coin));
      rows.set(coin.coin, (rows.get(coin.coin) ?? 0n) + amount);
    }

    return [...rows].map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const startTime = Date.parse(`${since}T00:00:00.000Z`).toString();
    const endTime = until ? Date.parse(`${until}T23:59:59.999Z`).toString() : Date.now().toString();
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<{ rows: Array<{ id: string; coin: string; amount: string; successAt: string }> }>(
      "/v5/asset/deposit/query-record",
      { startTime, endTime, limit: "50" },
    );
    for (const row of deposits.rows ?? []) {
      movements.push(movement(row.id, row.successAt, row.coin, row.amount, "in", "Bybit deposit."));
    }

    const withdrawals = await this.signedGet<{ rows: Array<{ withdrawId: string; coin: string; amount: string; updateTime: string }> }>(
      "/v5/asset/withdraw/query-record",
      { startTime, endTime, limit: "50" },
    );
    for (const row of withdrawals.rows ?? []) {
      movements.push(movement(row.withdrawId, row.updateTime, row.coin, row.amount, "out", "Bybit withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.fetchBalances();
  }
}

function movement(id: string, ms: string, coin: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `bybit-${id}`,
    occurredOn: new Date(Number(ms)).toISOString().slice(0, 10),
    assetCode: coin,
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(coin)),
    description,
    chain: "bybit",
  };
}

export const bybitVenue: VenueDefinition = {
  key: "bybit",
  label: "Bybit",
  summary: "Read-only balances, deposits, and withdrawals from a Bybit account.",
  keyUrl: "https://www.bybit.com/app/user/api-management",
  scopes: ["Read-Only", "Wallet (read)"],
  create(credential, options = {}) {
    return new BybitConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
