/**
 * Transactional email. A small port with one live implementation (Resend) and a
 * log fallback so development and CI never send anything. The send helper
 * retries a transient failure with backoff; a permanent failure is returned, not
 * thrown, so a caller can decide whether it is fatal.
 *
 * No message or token is ever logged. See docs/adr-email.md.
 */
import { readEmailFrom, readResendApiKey } from "@/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  sent: boolean;
  /** A caller-safe reason when not sent. */
  reason?: string;
  provider: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
  readonly httpStatus: number | null;
  readonly retryable: boolean;
  constructor(message: string, options: { httpStatus?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "EmailError";
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? false;
  }
}

/** Resend. Reads its key at construction; throws on construction if unset. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; from?: { email: string; name: string }; fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
    const apiKey = options.apiKey ?? readResendApiKey();
    if (!apiKey) throw new EmailError("RESEND_API_KEY is not set.");
    const from = options.from ?? readEmailFrom();
    if (!from) throw new EmailError("EMAIL_FROM is not set.");
    this.apiKey = apiKey;
    this.from = from.name ? `${from.name} <${from.email}>` : from.email;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://api.resend.com";
  }

  get configured(): boolean {
    return true;
  }

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: message.to, subject: message.subject, text: message.text, html: message.html }),
      });
    } catch {
      throw new EmailError("The email service could not be reached.", { retryable: true });
    }
    if (!response.ok) {
      // 5xx and 429 are worth a retry; 4xx are not.
      const retryable = response.status >= 500 || response.status === 429;
      throw new EmailError(`The email service returned HTTP ${response.status}.`, { httpStatus: response.status, retryable });
    }
  }
}

/** A fallback that records nothing and reports "not configured". */
export class NoopEmailProvider implements EmailProvider {
  readonly name = "none";
  readonly configured = false;
  async send(): Promise<void> {
    throw new EmailError("Email is not configured.");
  }
}

/** Pick a provider: Resend when configured, otherwise the no-op fallback. */
export function defaultEmailProvider(): EmailProvider {
  try {
    if (readResendApiKey() && readEmailFrom()) return new ResendEmailProvider();
  } catch {
    // A malformed EMAIL_FROM should not crash the app; fall back to no-op.
  }
  return new NoopEmailProvider();
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

/**
 * Send with bounded retries on a retryable failure. Never throws: returns
 * `{ sent: false, reason }` when it could not send, so a caller can fall back to
 * an on-screen link. The `sleep` is injectable so tests do not wait.
 */
export async function sendEmail(
  message: EmailMessage,
  options: { provider?: EmailProvider; sleep?: (ms: number) => Promise<void> } = {},
): Promise<EmailResult> {
  const provider = options.provider ?? defaultEmailProvider();
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (!provider.configured) return { sent: false, reason: "Email is not configured.", provider: provider.name };

  let lastError: EmailError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await provider.send(message);
      return { sent: true, provider: provider.name };
    } catch (error) {
      const emailError = error instanceof EmailError ? error : new EmailError("The email could not be sent.");
      lastError = emailError;
      if (!emailError.retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  return { sent: false, reason: lastError?.message ?? "The email could not be sent.", provider: provider.name };
}
