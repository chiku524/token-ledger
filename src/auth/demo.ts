import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./roles";
import { isRole } from "./roles";

const DEMO_ONLY_KEY = "token-ledger-demo-sign-in-not-for-production";

export interface DemoClaims {
  role: Role;
  name: string;
  email: string;
  entityScope: string[];
  exp: number;
}

/**
 * Demo sign-in exists only for the example books.
 * A configured database, production, or Vercel production disables it.
 */
export function demoSignInAllowed(env: {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
} = {
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
}): boolean {
  if (env.DATABASE_URL?.trim()) return false;
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return true;
}

export function signDemoToken(claims: DemoClaims, secret = DEMO_ONLY_KEY): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** A signed demo cookie is ignored whenever demo sign-in is not allowed. */
export function demoSessionFromCookie(
  token: string | undefined,
  env?: { DATABASE_URL?: string; NODE_ENV?: string; VERCEL_ENV?: string },
  now = Date.now(),
): DemoClaims | null {
  if (!demoSignInAllowed(env)) return null;
  return readDemoToken(token, now);
}

export function readDemoToken(token: string | undefined, now = Date.now(), secret = DEMO_ONLY_KEY): DemoClaims | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<DemoClaims>;
    if (!parsed.role || !isRole(parsed.role) || !parsed.email || !parsed.name || typeof parsed.exp !== "number") return null;
    if (parsed.exp < now) return null;
    return {
      role: parsed.role,
      name: parsed.name,
      email: parsed.email,
      entityScope: Array.isArray(parsed.entityScope) ? parsed.entityScope.filter((id) => typeof id === "string") : [],
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
