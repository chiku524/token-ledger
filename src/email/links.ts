/**
 * Build absolute links for emails and send a message, reporting whether it went
 * out. The base URL comes from APP_URL when set (production), otherwise the
 * request host so a preview or local run links to itself.
 */
import { sendEmail, type EmailMessage, type EmailResult } from "./provider";

export function baseUrl(host: string | null, proto: string | null = null): string | null {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (!host) return null;
  return `${proto ?? "https"}://${host}`;
}

export function absoluteLink(path: string, host: string | null, proto: string | null = null): string | null {
  const base = baseUrl(host, proto);
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : null;
}

/**
 * Send a transactional email and report the outcome. Never throws: an unset
 * provider or a delivery failure returns `{ sent: false, reason }` so the caller
 * can fall back to showing the link.
 */
export async function deliver(message: EmailMessage): Promise<EmailResult> {
  return sendEmail(message);
}
