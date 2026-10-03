/**
 * KuCoin venue, read-only. HMAC-SHA256, key version 2, plus the passphrase.
 *
 * Reads account balances, deposits, and withdrawals. The key must be created
 * with General permission only. KuCoin broker OAuth is not used: its default
 * Fast API grant is not limited to read.
 */
import { createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.kucoin.com";

interface KucoinResponse<T> {
  code: string;
  msg?: string;
  data: T;
}

class KucoinConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async signedGet<T>(path: string): Promise<T> {
    const passphrase = this.credential.apiPassphrase?.trim() ?? "";
    if (!passphrase) throw new ExchangeHttpError("KuCoin needs the API passphrase.", "auth");
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", this.credential.apiSecret).update(`${timestamp}GET${path}`).digest("base64");
    const signedPassphrase = createHmac("sha256", this.credential.apiSecret).update(passphrase).digest("base64");
    const json = await requestJson<KucoinResponse<T>>(this.fetchImpl, `${this.baseUrl}${path}`, {
      headers: {
        "KC-API-KEY": this.credential.apiKey,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": signedPassphrase,
        "KC-API-KEY-VERSION": "2",
      },
    });
    if (json.code !== "200000") {
      throw new ExchangeHttpError(json.msg || "KuCoin rejected the credential.", "auth");
    }
    return json.data;
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const accounts = await this.signedGet<Array<{ currency: string; balance: string }>>("/api/v1/accounts");
    const totals = new Map<string, bigint>();
    for (const account of accounts) {
      const quantity = toMinorUnits(account.balance || "0", decimalsFor(account.currency));
      totals.set(account.currency, (totals.get(account.currency) ?? 0n) + quantity);
    }
    return [...totals.entries()]
      .filter(([, quantityMinor]) => quantityMinor !== 0n)
      .map(([assetCode, quantityMinor]) => ({ assetCode, quantityMinor, asOf }));
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const startAt = Date.parse(`${since}T00:00:00.000Z`);
    const endAt = until ? Date.parse(`${until}T23:59:59.999Z`) : Date.now();
    const query = `status=SUCCESS&startAt=${startAt}&endAt=${endAt}`;
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<{ items?: Array<{ id?: string; walletTxId?: string; currency: string; amount: string; createdAt: number }> }>(
      `/api/v1/deposits?${query}`,
    );
    for (const row of deposits.items ?? []) {
      movements.push(movement(row.id || row.walletTxId || String(row.createdAt), row.createdAt, row.currency, row.amount, "in", "KuCoin deposit."));
    }

    const withdrawals = await this.signedGet<{ items?: Array<{ id?: string; walletTxId?: string; currency: string; amount: string; createdAt: number }> }>(
      `/api/v1/withdrawals?${query}`,
    );
    for (const row of withdrawals.items ?? []) {
      movements.push(movement(row.id || row.walletTxId || String(row.createdAt), row.createdAt, row.currency, row.amount, "out", "KuCoin withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.signedGet("/api/v1/accounts");
  }
}

function movement(id: string, ms: number, coin: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `kucoin-${id}`,
    occurredOn: new Date(ms).toISOString().slice(0, 10),
    assetCode: coin,
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(coin)),
    description,
    chain: "kucoin",
  };
}

export const kucoinVenue: VenueDefinition = {
  key: "kucoin",
  label: "KuCoin",
  summary: "Read-only balances, deposits, and withdrawals from a KuCoin account.",
  keyUrl: "https://www.kucoin.com/account/api",
  scopes: ["General"],
  create(credential, options = {}) {
    return new KucoinConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
