/**
 * Minimal read-only client for the Esplora HTTP API. It only ever issues GETs
 * for address and transaction data. There is no signing, no wallet, and no
 * broadcast path. See docs/adr-bitcoin-data-source.md.
 */
import { readBitcoinEsploraUrl } from "@/env";

export class EsploraError extends Error {
  readonly httpStatus: number | null;

  constructor(message: string, options: { httpStatus?: number | null } = {}) {
    super(message);
    this.name = "EsploraError";
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface EsploraClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class EsploraClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: EsploraClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? readBitcoinEsploraUrl()).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new EsploraError(`Esplora request to ${path} ${reason}.`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new EsploraError(`Esplora returned HTTP ${response.status} for ${path}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    return (await response.json()) as T;
  }
}
