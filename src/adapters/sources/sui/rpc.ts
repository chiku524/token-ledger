/**
 * Minimal read-only Sui JSON-RPC client. It only ever POSTs read methods.
 * There is no signing and no executeTransactionBlock path. Sui Foundation has
 * deprecated JSON-RPC on its public nodes; a managed provider serves it, and
 * SUI_RPC_URL can point elsewhere. See docs/adr-sui-data-source.md.
 */
import { readAlchemyApiKey, readSuiRpcUrl } from "@/env";

export class SuiRpcError extends Error {
  readonly code: number | null;
  readonly httpStatus: number | null;

  constructor(message: string, options: { code?: number | null; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "SuiRpcError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface SuiRpcClientOptions {
  url?: string;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function resolveSuiEndpoint(options: { url?: string; apiKey?: string | null } = {}): string | null {
  if (options.url) return options.url;
  const override = readSuiRpcUrl();
  if (override) return override;
  const apiKey = options.apiKey === undefined ? readAlchemyApiKey() : options.apiKey;
  if (apiKey) return `https://sui-mainnet.g.alchemy.com/v2/${apiKey}`;
  return null;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export class SuiRpcClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(options: SuiRpcClientOptions = {}) {
    const endpoint = resolveSuiEndpoint(options);
    if (!endpoint) {
      throw new SuiRpcError(
        "No Sui endpoint. Set ALCHEMY_API_KEY (Sui is served by Alchemy) or SUI_RPC_URL.",
      );
    }
    this.url = endpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const id = this.nextId++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new SuiRpcError(`Sui RPC request for ${method} ${reason}.`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new SuiRpcError(`Sui RPC returned HTTP ${response.status} for ${method}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new SuiRpcError(`Sui RPC error for ${method}: ${body.error.message}`, { code: body.error.code });
    }
    if (body.result === undefined) {
      throw new SuiRpcError(`Sui RPC returned no result for ${method}.`);
    }
    return body.result;
  }
}
