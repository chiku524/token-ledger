/**
 * OKX venue, read-only. HMAC-SHA256 plus the passphrase the user set on the key.
 *
 * Reads trading-account balances, deposits, and withdrawals. The key must be
 * created with Read only. Trade and Withdraw stay off. OKX broker OAuth is not
 * used: its Fast API grant includes trade permission.
 */
import { createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://www.okx.com";

interface OkxResponse<T> {
  code: string;
  msg?: string;
  data: T;
}

class OkxConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async signedGet<T>(path: string): Promise<T> {
    const passphrase = this.credential.apiPassphrase?.trim() ?? "";
    if (!passphrase) throw new ExchangeHttpError("OKX needs the API passphrase.", "auth");
    const timestamp = new Date().toISOString();
    const signature = createHmac("sha256", this.credential.apiSecret).update(`${timestamp}GET${path}`).digest("base64");
    const json = await requestJson<OkxResponse<T>>(this.fetchImpl, `${this.baseUrl}${path}`, {
      headers: {
        "OK-ACCESS-KEY": this.credential.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
      },
    });
    if (json.code !== "0") {
      throw new ExchangeHttpError(json.msg || "OKX rejected the credential.", "auth");
    }
    return json.data;
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const accounts = await this.signedGet<Array<{ details?: Array<{ ccy: string; cashBal: string }> }>>("/api/v5/account/balance");
    const rows: NormalizedBalance[] = [];
    for (const account of accounts) {
      for (const detail of account.details ?? []) {
        const quantityMinor = toMinorUnits(detail.cashBal || "0", decimalsFor(detail.ccy));
        if (quantityMinor !== 0n) rows.push({ assetCode: detail.ccy, quantityMinor, asOf });
      }
    }
    return rows;
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const start = Date.parse(`${since}T00:00:00.000Z`);
    const end = until ? Date.parse(`${until}T23:59:59.999Z`) : Date.now();
    const query = `after=${start - 1}&before=${end + 1}`;
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<Array<{ depId?: string; txId?: string; ccy: string; amt: string; ts: string; state: string }>>(
      `/api/v5/asset/deposit-history?${query}`,
    );
    for (const row of deposits) {
      if (row.state !== "2") continue;
      movements.push(movement(row.depId || row.txId || row.ts, row.ts, row.ccy, row.amt, "in", "OKX deposit."));
    }

    const withdrawals = await this.signedGet<Array<{ wdId?: string; txId?: string; ccy: string; amt: string; ts: string; state: string }>>(
      `/api/v5/asset/withdrawal-history?${query}`,
    );
    for (const row of withdrawals) {
      if (row.state !== "2") continue;
      movements.push(movement(row.wdId || row.txId || row.ts, row.ts, row.ccy, row.amt, "out", "OKX withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.signedGet("/api/v5/account/balance");
  }
}

function movement(id: string, ts: string, coin: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `okx-${id}`,
    occurredOn: new Date(Number(ts)).toISOString().slice(0, 10),
    assetCode: coin,
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(coin)),
    description,
    chain: "okx",
  };
}

export const okxVenue: VenueDefinition = {
  key: "okx",
  label: "OKX",
  summary: "Read-only balances, deposits, and withdrawals from an OKX account.",
  keyUrl: "https://www.okx.com/account/my-api",
  scopes: ["Read"],
  create(credential, options = {}) {
    return new OkxConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
