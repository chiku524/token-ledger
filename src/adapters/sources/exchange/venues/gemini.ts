/**
 * Gemini venue, read-only.
 *
 * An API key signs with HMAC-SHA384. An OAuth grant stores the access token as
 * the key and `tl-oauth:` plus the refresh token as the secret, then calls the
 * same reads with a bearer token. Scopes stay balances:read and history:read.
 * Never calls an order, withdraw, or send endpoint.
 */
import { createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import { OAUTH_SECRET_PREFIX } from "@/auth/exchange-oauth";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { ExchangeHttpError, requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.gemini.com";

interface GeminiBalance {
  currency: string;
  amount: string;
}

interface GeminiTransfer {
  eid?: number | string;
  type?: string;
  status?: string;
  timestampms?: number;
  currency?: string;
  amount?: string;
}

class GeminiConnector implements VenueConnector {
  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private get oauth(): boolean {
    return this.credential.apiSecret.startsWith(OAUTH_SECRET_PREFIX);
  }

  private async privatePost<T>(path: string, extra: Record<string, unknown> = {}): Promise<T> {
    const payload: Record<string, unknown> = { request: path, ...extra };
    if (!this.oauth) payload.nonce = Date.now().toString();
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      "Content-Length": "0",
      "X-GEMINI-PAYLOAD": encoded,
      "Cache-Control": "no-cache",
    };
    if (this.oauth) {
      headers.Authorization = `Bearer ${this.credential.apiKey}`;
    } else {
      headers["X-GEMINI-APIKEY"] = this.credential.apiKey;
      headers["X-GEMINI-SIGNATURE"] = createHmac("sha384", this.credential.apiSecret).update(encoded).digest("hex");
    }
    try {
      const json = await requestJson<T>(this.fetchImpl, `${this.baseUrl}${path}`, { method: "POST", headers });
      if (isGeminiError(json)) {
        throw new ExchangeHttpError("Gemini rejected the credential.", "auth");
      }
      return json;
    } catch (error) {
      if (error instanceof ExchangeHttpError && error.kind === "auth") {
        throw new ExchangeHttpError("Gemini rejected the credential.", "auth");
      }
      throw error;
    }
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const rows = await this.privatePost<GeminiBalance[]>("/v1/balances");
    return rows
      .map((row) => ({
        assetCode: row.currency,
        quantityMinor: toMinorUnits(row.amount || "0", decimalsFor(row.currency)),
        asOf,
      }))
      .filter((row) => row.quantityMinor !== 0n);
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const rows = await this.privatePost<GeminiTransfer[]>("/v1/transfers", { limit_transfers: 50 });
    const movements: NormalizedSourceTransaction[] = [];
    for (const row of rows) {
      if (row.status !== "Complete" || !row.currency || !row.amount || row.timestampms == null) continue;
      const direction = row.type === "Deposit" ? "in" : row.type === "Withdrawal" ? "out" : null;
      if (!direction) continue;
      const occurredOn = new Date(row.timestampms).toISOString().slice(0, 10);
      if (occurredOn < since || (until && occurredOn > until)) continue;
      movements.push({
        externalId: `gemini-${row.eid ?? row.timestampms}`,
        occurredOn,
        assetCode: row.currency,
        direction,
        quantityMinor: toMinorUnits(row.amount, decimalsFor(row.currency)),
        description: direction === "in" ? "Gemini deposit." : "Gemini withdrawal.",
        chain: "gemini",
      });
    }
    return movements.sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.privatePost("/v1/balances");
  }
}

function isGeminiError(value: unknown): boolean {
  return typeof value === "object" && value !== null && "result" in value && (value as { result?: string }).result === "error";
}

export const geminiVenue: VenueDefinition = {
  key: "gemini",
  label: "Gemini",
  summary: "Read-only balances and transfers from a Gemini account.",
  keyUrl: "https://exchange.gemini.com/settings/api",
  scopes: ["Auditor"],
  create(credential, options = {}) {
    return new GeminiConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
