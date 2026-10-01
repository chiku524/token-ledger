/**
 * Read-only Fireblocks client.
 *
 * Authenticated with a Viewer API user (read-only). It only ever calls read
 * endpoints; it never creates, signs, or broadcasts a transaction.
 * See docs/adr-custodian-connectors.md.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { FireblocksPagedVaultAccounts, FireblocksTransaction, FireblocksVaultAccount } from "./fireblocks-responses";
import { signFireblocksJwt } from "./fireblocks-jwt";

export class FireblocksError extends Error {
  readonly kind: "auth" | "rate" | "http" | "api" | "network";

  constructor(message: string, kind: FireblocksError["kind"]) {
    super(message);
    this.name = "FireblocksError";
    this.kind = kind;
  }
}

export interface FireblocksClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const FIREBLOCKS_SANDBOX_URL = "https://sandbox-api.fireblocks.io/v1";
export const FIREBLOCKS_MAINNET_URL = "https://api.fireblocks.io/v1";

/** Credential: the API key is `apiKey`; the RSA private key PEM is `apiSecret`. */
export class FireblocksClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly credential: ExchangeCredentialInput,
    options: FireblocksClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? FIREBLOCKS_MAINNET_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async getVaultAccounts(): Promise<FireblocksPagedVaultAccounts> {
    return this.get<FireblocksPagedVaultAccounts>("/vault/accounts_paged");
  }

  async getVaultAccount(vaultAccountId: string): Promise<FireblocksVaultAccount> {
    return this.get<FireblocksVaultAccount>(`/vault/accounts/${vaultAccountId}`);
  }

  async getTransactions(params: { after?: number; before?: number; limit?: number } = {}): Promise<FireblocksTransaction[]> {
    const query = new URLSearchParams();
    if (params.after !== undefined) query.set("after", String(params.after));
    if (params.before !== undefined) query.set("before", String(params.before));
    query.set("limit", String(params.limit ?? 100));
    return this.get<FireblocksTransaction[]>(`/transactions?${query.toString()}`);
  }

  private async get<T>(path: string): Promise<T> {
    const uri = `/v1${path.split("?")[0]}`;
    const jwt = signFireblocksJwt({ apiKey: this.credential.apiKey, privateKey: this.credential.apiSecret, uri });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { "X-API-Key": this.credential.apiKey, Authorization: `Bearer ${jwt}`, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new FireblocksError(`Fireblocks request ${reason}.`, "network");
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new FireblocksError("Fireblocks rejected the credential.", "auth");
    }
    if (response.status === 429) {
      throw new FireblocksError("Fireblocks rate limit was hit.", "rate");
    }
    if (!response.ok) {
      throw new FireblocksError(`Fireblocks returned HTTP ${response.status}.`, "http");
    }
    return (await response.json()) as T;
  }
}
