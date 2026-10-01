/**
 * Minimal read-only Sui GraphQL client.
 *
 * Sui Foundation disabled JSON-RPC on its public nodes (week of July 27, 2026;
 * full removal mid-October 2026). This client uses the public, keyless GraphQL
 * endpoint instead, which is the documented migration target. It only ever
 * issues read queries; there is no mutation or signing path.
 *
 * See docs/adr-sui-data-source.md.
 */
import { readSuiGraphqlUrl } from "@/env";

export class SuiGraphqlError extends Error {
  readonly httpStatus: number | null;

  constructor(message: string, options: { httpStatus?: number | null } = {}) {
    super(message);
    this.name = "SuiGraphqlError";
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface SuiGraphqlClientOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

interface GraphqlResponse<T> {
  data?: T | null;
  errors?: Array<{ message: string }>;
}

export class SuiGraphqlClient {
  readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SuiGraphqlClientOptions = {}) {
    this.url = options.url ?? readSuiGraphqlUrl();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new SuiGraphqlError(`Sui GraphQL request ${reason}.`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = response.status === 429 && retryAfter ? ` Retry after ${retryAfter}s.` : "";
      throw new SuiGraphqlError(`Sui GraphQL returned HTTP ${response.status}.${suffix}`, {
        httpStatus: response.status,
      });
    }

    const body = (await response.json()) as GraphqlResponse<T>;
    if (body.errors && body.errors.length > 0) {
      throw new SuiGraphqlError(`Sui GraphQL error: ${body.errors.map((error) => error.message).join("; ")}`);
    }
    if (body.data === undefined || body.data === null) {
      throw new SuiGraphqlError("Sui GraphQL returned no data.");
    }
    return body.data;
  }
}
