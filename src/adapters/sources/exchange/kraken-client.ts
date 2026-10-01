/**
 * Read-only Kraken REST client.
 *
 * Authenticated with a user-supplied read-only key (Query Funds, Query Ledger
 * Entries, Query Closed Orders & Trades). It only ever calls read methods;
 * AddOrder, CancelOrder, and Withdraw are never referenced. See
 * docs/adr-exchange-connectors.md.
 */
import { createHash, createHmac } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { KrakenAssetsResult, KrakenLedgersResult, KrakenTradesResult } from "./kraken-responses";

export class KrakenError extends Error {
  readonly kind: "auth" | "rate" | "http" | "api";

  constructor(message: string, kind: KrakenError["kind"]) {
    super(message);
    this.name = "KrakenError";
    this.kind = kind;
  }
}

export interface KrakenClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.kraken.com";
const DEFAULT_TIMEOUT_MS = 15_000;

interface KrakenEnvelope<T> {
  error: string[];
  result: T;
}

export class KrakenClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private lastNonce = 0;

  constructor(
    private readonly credential: ExchangeCredentialInput,
    options: KrakenClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Public. No credential is used. */
  async getAssets(): Promise<KrakenAssetsResult> {
    return this.publicPost<KrakenAssetsResult>("public/Assets", {});
  }

  /** Private read. Query Funds. */
  async getBalance(): Promise<KrakenEnvelope<Record<string, string>>> {
    return this.privatePost("private/Balance", {});
  }

  /** Private read. Query Ledger Entries. */
  async getLedgers(params: { start?: number; end?: number; ofs?: number } = {}): Promise<KrakenEnvelope<KrakenLedgersResult>> {
    return this.privatePost("private/Ledgers", { ...params });
  }

  /** Private read. Query Closed Orders & Trades. */
  async getTradesHistory(params: { start?: number; end?: number; ofs?: number } = {}): Promise<KrakenEnvelope<KrakenTradesResult>> {
    return this.privatePost("private/TradesHistory", { ...params });
  }

  private async publicPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
    const body = new URLSearchParams(stringifyParams(params)).toString();
    const response = await this.fetchWithTimeout(`${this.baseUrl}/0/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const envelope = (await response.json()) as KrakenEnvelope<T>;
    this.assertNoError(envelope.error);
    return envelope.result;
  }

  private async privatePost<T>(path: string, params: Record<string, unknown>): Promise<KrakenEnvelope<T>> {
    const nonce = this.nextNonce();
    const body = new URLSearchParams(stringifyParams({ ...params, nonce })).toString();
    const signature = sign(path, nonce, body, this.credential.apiSecret);

    const response = await this.fetchWithTimeout(`${this.baseUrl}/0/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "API-Key": this.credential.apiKey,
        "API-Sign": signature,
      },
      body,
    });
    const envelope = (await response.json()) as KrakenEnvelope<T>;
    this.assertNoError(envelope.error);
    return envelope;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new KrakenError(`Kraken request ${reason}.`, "http");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new KrakenError(`Kraken returned HTTP ${response.status}.`, "http");
    }
    return response;
  }

  private assertNoError(errors: string[]): void {
    if (!errors || errors.length === 0) return;
    const message = errors.join("; ");
    if (/invalid key|invalid signature|permission denied/i.test(message)) {
      throw new KrakenError(`Kraken rejected the credential: ${message}`, "auth");
    }
    if (/rate limit/i.test(message)) {
      throw new KrakenError(`Kraken rate limit: ${message}`, "rate");
    }
    throw new KrakenError(`Kraken error: ${message}`, "api");
  }

  /** Kraken requires a strictly increasing nonce, in milliseconds. */
  private nextNonce(): number {
    const now = Date.now();
    this.lastNonce = now > this.lastNonce ? now : this.lastNonce + 1;
    return this.lastNonce;
  }
}

/** Kraken expects every value as a string. */
function stringifyParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * API-Sign = base64( HMAC-SHA512( base64decode(secret), urlPath + SHA256(nonce + postData) ) ).
 */
export function sign(path: string, nonce: number, postData: string, apiSecret: string): string {
  const secret = Buffer.from(apiSecret, "base64");
  const sha256 = createHash("sha256").update(nonce + postData).digest();
  const message = Buffer.concat([Buffer.from(`/0/${path}`), sha256]);
  return createHmac("sha512", secret).update(message).digest("base64");
}
