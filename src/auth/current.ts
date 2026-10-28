import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasDatabase } from "@/db/availability";
import { userForSessionToken, type AccountUser } from "@/db/auth-store";
import { DEFAULT_ORGANIZATION_ACCOUNT_TYPE, type OrganizationAccountType } from "@/data/account-type";
import { isPlatformAdminEmail } from "@/env";
import { CSRF_COOKIE, csrfMatches, newCsrfToken, originAllowed } from "./csrf";
import { DEMO_COOKIE, DEMO_DATA_COOKIE, SESSION_COOKIE } from "./cookies";
import { demoSessionFromCookie, demoSignInAllowed } from "./demo";
import type { Permission, Role } from "./roles";
import { can } from "./roles";

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  /** Whether this user's books belong to a company or a person. Demo sessions are organizations. */
  accountType: OrganizationAccountType;
  /** Cross-organization operator role, from the stored flag or the env allowlist. */
  platformAdmin: boolean;
  entityScope: string[];
  demo: boolean;
  /**
   * When true, the dashboard shows the example books even on a real database,
   * and every page is read-only. Set from the "Demo data" switch.
   */
  demoBooks?: boolean;
  /** Null until this owner or admin finishes or skips the getting started guide. */
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
        organizationId: "org_asset_manager_a",
        email: demo.email,
        name: demo.name,
        role: demo.role,
        accountType: DEFAULT_ORGANIZATION_ACCOUNT_TYPE,
        platformAdmin: false,
        entityScope: demo.entityScope,
        demo: true,
        demoBooks: true,
        connectionTourCompletedAt: null,
        emailVerified: true,
      };
    }
  }
  if (!hasDatabase()) return null;
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await userForSessionToken(token);
  if (!user) return null;
  const session = toSession(user);
  if (jar.get(DEMO_DATA_COOKIE)?.value !== "1") return session;
  // Demo data ignores the organization's entities and scope: it is the fixed
  // example books, shown read-only.
  return { ...session, demoBooks: true, entityScope: [] };
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

/**
 * Whether the signed-in session is a platform admin. True when the user holds
 * the stored `platform_admin` flag, or their email is on the `PLATFORM_ADMIN_EMAILS`
 * allowlist — the allowlist is the bootstrap that lets the first admin in before
 * anyone holds the flag. Not available in demo mode.
 */
export function isPlatformAdmin(session: SessionUser | null): boolean {
  if (!session || session.demo) return false;
  return session.platformAdmin || isPlatformAdminEmail(session.email);
}

/**
 * Require a platform admin: an email on the `PLATFORM_ADMIN_EMAILS` allowlist.
 * Separate from any organization role, so an org owner/admin never qualifies.
 * Redirects a signed-in non-admin home, and a visitor to sign-in.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (!isPlatformAdmin(session)) redirect("/dashboard");
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
    accountType: user.accountType ?? DEFAULT_ORGANIZATION_ACCOUNT_TYPE,
    platformAdmin: user.platformAdmin,
    entityScope: user.entityScope,
    demo: false,
    demoBooks: false,
    connectionTourCompletedAt: user.connectionTourCompletedAt ? user.connectionTourCompletedAt.toISOString() : null,
    emailVerified: user.emailVerifiedAt !== null,
  };
}
