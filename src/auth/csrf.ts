import { randomBytes } from "node:crypto";

export const CSRF_COOKIE = "tl_csrf";

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfMatches(cookieValue: string | undefined, formValue: string | undefined): boolean {
  if (!cookieValue || !formValue) return false;
  return cookieValue.length === formValue.length && cookieValue === formValue;
}

/** Reject a browser request whose Origin host is not this app. */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/dashboard") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  return value;
}
