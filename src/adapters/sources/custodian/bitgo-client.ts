/**
 * Read-only BitGo client.
 *
 * Authenticated with a user access token (bearer). It only ever calls read
 * endpoints; it never creates, signs, or sends a transaction.
 * See docs/adr-custodian-connectors.md.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { BitGoBalancesResponse, BitGoTransfersResponse, BitGoWalletsResponse } from "./bitgo-responses";

export class BitGoError extends Error {
  readonly kind: "auth" | "rate" | "http" | "api" | "network";

  constructor(message: string, kind: BitGoError["kind"]) {
    super(message);
    this.name = "BitGoError";
    this.kind = kind;
  }
}

export interface BitGoClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const BITGO_TEST_URL = "https://app.bitgo-test.com";
export const BITGO_PROD_URL = "https://www.bitgo.com";

/** Credential: `apiKey` is the access token; `apiSecret` is unused for token auth. */
export class BitGoClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly credential: ExchangeCredentialInput,
    options: BitGoClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? BITGO_PROD_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  /** All wallet balances in one call, across coins. */
  async getBalances(params: { coin?: string[]; excludeEmptyBalances?: boolean } = {}): Promise<BitGoBalancesResponse> {
    const query = new URLSearchParams();
    if (params.coin) for (const coin of params.coin) query.append("coin", coin);
    query.set("excludeEmptyBalances", String(params.excludeEmptyBalances ?? true));
    query.set("allTokens", "true");
    return this.get<BitGoBalancesResponse>(`/api/v2/wallet/balances?${query.toString()}`);
  }

  async getWallets(coin: string): Promise<BitGoWalletsResponse> {
    return this.get<BitGoWalletsResponse>(`/api/v2/${encodeURIComponent(coin)}/wallet`);
  }

  async getTransfers(coin: string, walletId: string, prevId?: string): Promise<BitGoTransfersResponse> {
    const query = new URLSearchParams({ limit: "100" });
    if (prevId) query.set("prevId", prevId);
    return this.get<BitGoTransfersResponse>(`/api/v2/${encodeURIComponent(coin)}/wallet/${encodeURIComponent(walletId)}/transfer?${query.toString()}`);
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.credential.apiKey}`, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new BitGoError(`BitGo request ${reason}.`, "network");
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new BitGoError("BitGo rejected the credential.", "auth");
    }
    if (response.status === 429) {
      throw new BitGoError("BitGo rate limit was hit.", "rate");
    }
    if (!response.ok) {
      throw new BitGoError(`BitGo returned HTTP ${response.status}.`, "http");
    }
    return (await response.json()) as T;
  }
}
