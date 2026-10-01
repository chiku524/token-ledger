/**
 * Shared HTTP and amount helpers for accounting sync. The sync path is a
 * **write** (it pushes journals), so it uses POST/PUT and carries credentials;
 * it is not part of the read-only source contract.
 */
import { formatMinor } from "@/ledger";

export class AccountingError extends Error {
  readonly kind: "auth" | "rate" | "http" | "api" | "network";

  constructor(message: string, kind: AccountingError["kind"]) {
    super(message);
    this.name = "AccountingError";
    this.kind = kind;
  }
}

export interface HttpCall {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function callJson<T>(fetchImpl: typeof fetch, call: HttpCall): Promise<{ status: number; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? 20_000);
  let response: Response;
  try {
    response = await fetchImpl(call.url, {
      method: call.method,
      headers: call.headers,
      body: call.body,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
    throw new AccountingError(`Accounting request ${reason}.`, "network");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) throw new AccountingError("The accounting system rejected the credential.", "auth");
  if (response.status === 429) throw new AccountingError("The accounting system rate limit was hit.", "rate");
  if (response.status < 200 || response.status >= 300) {
    const text = await response.text().catch(() => "");
    throw new AccountingError(`Accounting system returned HTTP ${response.status}: ${text.slice(0, 200)}`, "http");
  }
  return { status: response.status, data: (await response.json()) as T };
}

/** Major-unit string from minor units, at the currency's 2-decimal scale. */
export function toMajorUnits(amountMinor: bigint, minorScale = 2): string {
  return formatMinor(amountMinor, minorScale, { minFraction: 2, maxFraction: 2, grouping: false });
}
