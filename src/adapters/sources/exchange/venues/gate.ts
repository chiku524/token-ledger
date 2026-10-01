/**
 * Gate.io venue, read-only (API v4). HMAC-SHA512 signing.
 *
 * Reads spot accounts, deposits, and withdrawals. Never calls an order or
 * withdraw endpoint.
 */
import { createHash, createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.gateio.ws";
const PREFIX = "/api/v4";

class GateConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async signedGet<T>(path: string, query = ""): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyHash = createHash("sha512").update("").digest("hex");
    const message = `GET\n${PREFIX}${path}\n${query}\n${bodyHash}\n${timestamp}`;
    const signature = createHmac("sha512", this.credential.apiSecret).update(message).digest("hex");
    const url = `${this.baseUrl}${PREFIX}${path}${query ? `?${query}` : ""}`;
    return requestJson<T>(this.fetchImpl, url, {
      headers: { KEY: this.credential.apiKey, Timestamp: timestamp, SIGN: signature },
    });
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const accounts = await this.signedGet<Array<{ currency: string; available: string; locked: string }>>("/spot/accounts");
    return accounts
      .map((account) => {
        const decimals = decimalsFor(account.currency);
        const total = toMinorUnits(account.available || "0", decimals) + toMinorUnits(account.locked || "0", decimals);
        return { assetCode: account.currency, quantityMinor: total, asOf };
      })
      .filter((row) => row.quantityMinor !== 0n);
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const from = Math.floor(Date.parse(`${since}T00:00:00.000Z`) / 1000);
    const to = until ? Math.floor(Date.parse(`${until}T23:59:59.999Z`) / 1000) : Math.floor(Date.now() / 1000);
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<Array<{ id: string; currency: string; amount: string; timestamp: string }>>(
      "/wallet/deposits",
      `from=${from}&to=${to}&limit=100`,
    );
    for (const row of deposits) {
      movements.push(movement(row.id, Number(row.timestamp) * 1000, row.currency, row.amount, "in", "Gate.io deposit."));
    }

    const withdrawals = await this.signedGet<Array<{ id: string; currency: string; amount: string; timestamp: string; status: string }>>(
      "/wallet/withdrawals",
      `from=${from}&to=${to}&limit=100`,
    );
    for (const row of withdrawals) {
      if (row.status && row.status !== "DONE") continue;
      movements.push(movement(row.id, Number(row.timestamp) * 1000, row.currency, row.amount, "out", "Gate.io withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.signedGet("/spot/accounts");
  }
}

function movement(id: string, ms: number, currency: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `gate-${id}`,
    occurredOn: new Date(ms).toISOString().slice(0, 10),
    assetCode: currency,
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(currency)),
    description,
    chain: "gate",
  };
}

export const gateVenue: VenueDefinition = {
  key: "gate",
  label: "Gate.io",
  summary: "Read-only spot balances, deposits, and withdrawals from a Gate.io account.",
  keyUrl: "https://www.gate.io/myaccount/apiv4keys",
  scopes: ["Spot: Account read", "Wallet: Read"],
  create(credential, options = {}) {
    return new GateConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
