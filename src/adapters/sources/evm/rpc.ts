/**
 * Minimal read-only client for the EVM JSON-RPC interface, including Alchemy's
 * enhanced methods when a key is present. It only ever POSTs a JSON-RPC call.
 * There is no signing, no keypair, and no eth_sendTransaction path.
 * See docs/adr-evm-data-source.md.
 */
import { readAlchemyApiKey } from "@/env";
import type { EvmChain } from "./chains";

export class EvmRpcError extends Error {
  readonly code: number | null;
  readonly httpStatus: number | null;

  constructor(message: string, options: { code?: number | null; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "EvmRpcError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface EvmRpcClientOptions {
  /** Explicit endpoint. Overrides the Alchemy/public choice. */
  url?: string;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export function resolveEndpoint(chain: EvmChain, options: { url?: string; apiKey?: string | null } = {}): string {
  if (options.url) return options.url;
  const apiKey = options.apiKey === undefined ? readAlchemyApiKey() : options.apiKey;
  if (apiKey) return `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
  return chain.publicRpcUrl;
}

export class EvmRpcClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(readonly chain: EvmChain, options: EvmRpcClientOptions = {}) {
    this.url = resolveEndpoint(chain, options);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** True when the endpoint is Alchemy, and its enhanced methods are available. */
  get enhanced(): boolean {
    return this.url.includes("alchemy.com");
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
      throw new EvmRpcError(`EVM RPC request for ${method} ${reason}.`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new EvmRpcError(`EVM RPC returned HTTP ${response.status} for ${method}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new EvmRpcError(`EVM RPC error for ${method}: ${body.error.message}`, { code: body.error.code });
    }
    if (body.result === undefined) {
      throw new EvmRpcError(`EVM RPC returned no result for ${method}.`);
    }
    return body.result;
  }
}
