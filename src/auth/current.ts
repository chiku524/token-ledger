import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readDatabaseUrl } from "@/env";
import { userForSessionToken, type AccountUser } from "@/db/auth-store";
import { CSRF_COOKIE, csrfMatches, newCsrfToken, originAllowed } from "./csrf";
import { DEMO_COOKIE, SESSION_COOKIE } from "./cookies";
import { demoSessionFromCookie, demoSignInAllowed } from "./demo";
import type { Permission, Role } from "./roles";
import { can } from "./roles";

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  entityScope: string[];
  demo: boolean;
  /** Null until this admin finishes or skips the connection tour. */
  connectionTourCompletedAt: string | null;
  /** True once the email is confirmed. Always true in demo mode. */
  emailVerified: boolean;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  if (demoSignInAllowed()) {
    const demo = demoSessionFromCookie(jar.get(DEMO_COOKIE)?.value);
    if (demo) {
      return {
        id: `demo_${demo.email}`,
        organizationId: "org_harbourline",
        email: demo.email,
        name: demo.name,
        role: demo.role,
        entityScope: demo.entityScope,
        demo: true,
        connectionTourCompletedAt: null,
        emailVerified: true,
      };
    }
  }
  if (!readDatabaseUrl()) return null;
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await userForSessionToken(token);
  return user ? toSession(user) : null;
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await requireSession();
  if (!can(session.role, permission)) {
    throw new AuthError("You do not have permission to do that.");
  }
  return session;
}

export async function ensureCsrf(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const fromProxy = (await headers()).get("x-token-ledger-csrf");
  if (fromProxy) return fromProxy;
  return newCsrfToken();
}

export async function assertCsrf(formData: FormData): Promise<void> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!originAllowed(headerList.get("origin"), host)) {
    throw new AuthError("Cross-site request blocked.");
  }
  const jar = await cookies();
  if (!csrfMatches(jar.get(CSRF_COOKIE)?.value, String(formData.get("csrf") ?? ""))) {
    throw new AuthError("The form expired. Refresh and try again.");
  }
}

export function actorName(session: SessionUser): string {
  return `${session.name} <${session.email}>`;
}

function toSession(user: AccountUser): SessionUser {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    entityScope: user.entityScope,
    demo: false,
    connectionTourCompletedAt: user.connectionTourCompletedAt ? user.connectionTourCompletedAt.toISOString() : null,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
