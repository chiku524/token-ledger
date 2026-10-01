/**
 * Minimal read-only client for the Solana JSON-RPC 2.0 interface.
 *
 * It only ever POSTs a JSON-RPC method. There is no signing, no keypair, and
 * no sendTransaction path. See docs/adr-solana-data-source.md.
 */
import { readSolanaRpcUrl } from "@/env";

export class SolanaRpcError extends Error {
  readonly code: number | null;
  readonly httpStatus: number | null;

  constructor(message: string, options: { code?: number | null; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "SolanaRpcError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface SolanaRpcClientOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string };
}

export class SolanaRpcClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(options: SolanaRpcClientOptions = {}) {
    this.url = options.url ?? readSolanaRpcUrl();
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
      throw new SolanaRpcError(`Solana RPC request for ${method} ${reason}.`, { code: null });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new SolanaRpcError(`Solana RPC returned HTTP ${response.status} for ${method}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new SolanaRpcError(`Solana RPC error for ${method}: ${body.error.message}`, { code: body.error.code });
    }
    if (body.result === undefined) {
      throw new SolanaRpcError(`Solana RPC returned no result for ${method}.`, { code: null });
    }
    return body.result;
  }
}
