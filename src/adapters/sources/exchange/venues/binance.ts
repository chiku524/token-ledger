/**
 * Binance venue, read-only (Spot SPOT API). HMAC-SHA256 signing.
 *
 * Reads spot balances, deposits, and withdrawals. Never calls an order or
 * withdraw endpoint.
 */
import { createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.binance.com";

class BinanceConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async signedGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: "5000" }).toString();
    const signature = createHmac("sha256", this.credential.apiSecret).update(query).digest("hex");
    try {
      return await requestJson<T>(this.fetchImpl, `${this.baseUrl}${path}?${query}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": this.credential.apiKey },
      });
    } catch (error) {
      if (error instanceof ExchangeHttpError && error.kind === "auth") {
        throw new ExchangeHttpError("Binance rejected the credential.", "auth");
      }
      throw error;
    }
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const account = await this.signedGet<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
      "/api/v3/account",
      { omitZeroBalances: "true" },
    );
    return account.balances
      .map((entry) => {
        const total = toMinorUnits(entry.free || "0", decimalsFor(entry.asset)) + toMinorUnits(entry.locked || "0", decimalsFor(entry.asset));
        return { assetCode: entry.asset, quantityMinor: total, asOf };
      })
      .filter((row) => row.quantityMinor !== 0n);
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const startTime = Date.parse(`${since}T00:00:00.000Z`);
    const endTime = until ? Date.parse(`${until}T23:59:59.999Z`) : Date.now();
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<Array<{ id: string; coin: string; amount: string; insertTime: number }>>(
      "/sapi/v1/capital/deposit/hisrec",
      { startTime: String(startTime), endTime: String(endTime), limit: "1000" },
    );
    for (const row of deposits) {
      movements.push(movement(row.id, row.insertTime, row.coin, row.amount, "in", "Binance deposit."));
    }

    const withdrawals = await this.signedGet<Array<{ id: string; coin: string; amount: string; applyTime: number; status: number }>>(
      "/sapi/v1/capital/withdraw/history",
      { startTime: String(startTime), endTime: String(endTime), limit: "1000" },
    );
    for (const row of withdrawals) {
      // Only completed withdrawals are movements.
      if (row.status !== 6) continue;
      movements.push(movement(row.id, row.applyTime, row.coin, row.amount, "out", "Binance withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.signedGet("/api/v3/account", { omitZeroBalances: "true" });
  }
}

function movement(id: string, ms: number, coin: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `binance-${id}`,
    occurredOn: new Date(ms).toISOString().slice(0, 10),
    assetCode: coin,
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(coin)),
    description,
    chain: "binance",
  };
}

export const binanceVenue: VenueDefinition = {
  key: "binance",
  label: "Binance",
  summary: "Read-only spot balances, deposits, and withdrawals from a Binance account.",
  keyUrl: "https://www.binance.com/en/my/settings/api-management",
  scopes: ["Enable Reading"],
  create(credential, options = {}) {
    return new BinanceConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
