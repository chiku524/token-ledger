/**
 * Shared HTTP helper for exchange REST clients. Read-only: callers only issue
 * GETs or signed read POSTs. A timeout, a typed error, and a clear signal for a
 * rejected credential and for rate limits.
 */
export class ExchangeHttpError extends Error {
  readonly kind: "auth" | "rate" | "http" | "api" | "network";
  readonly status: number | null;

  constructor(message: string, kind: ExchangeHttpError["kind"], status: number | null = null) {
    super(message);
    this.name = "ExchangeHttpError";
    this.kind = kind;
    this.status = status;
  }
}

export interface HttpOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function requestText(
  fetchImpl: typeof fetch,
  url: string,
  options: HttpOptions = {},
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
    throw new ExchangeHttpError(`Exchange request ${reason}.`, "network");
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(fetchImpl: typeof fetch, url: string, options: HttpOptions = {}): Promise<T> {
  const { status, text } = await requestText(fetchImpl, url, options);
  if (status === 401 || status === 403) {
    throw new ExchangeHttpError("The exchange rejected the credential.", "auth", status);
  }
  if (status === 429) {
    throw new ExchangeHttpError("The exchange rate limit was hit.", "rate", status);
  }
  if (status < 200 || status >= 300) {
    throw new ExchangeHttpError(`Exchange returned HTTP ${status}.`, "http", status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ExchangeHttpError("Exchange returned a non-JSON response.", "api", status);
  }
}
