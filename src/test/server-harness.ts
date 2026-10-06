import { expect, vi } from "vitest";
import { DEMO_COOKIE, SESSION_COOKIE } from "@/auth/cookies";
import { CSRF_COOKIE } from "@/auth/csrf";
import { signDemoToken } from "@/auth/demo";
import type { Role } from "@/auth/roles";
import type { AccountUser } from "@/db/auth-store";

export const HOST = "ledger.test";
export const ORIGIN = `https://${HOST}`;
export const CSRF = "csrf-token-for-tests";
export const ORG = "org_harbourline";
export const MY = "ent_harbourline_my";
export const SG = "ent_harbourline_sg";

export class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

const cookieValues = new Map<string, string>();
let headerValues = new Headers();
const liveUsers = new Map<string, AccountUser>();

export const cookieJar = {
  get: (name: string) => {
    const value = cookieValues.get(name);
    return value === undefined ? undefined : { name, value };
  },
  has: (name: string) => cookieValues.has(name),
  set: vi.fn((...[name, value]: [name: string, value: string, options?: Record<string, unknown>]) => {
    cookieValues.set(name, value);
  }),
  delete: vi.fn((name: string) => {
    cookieValues.delete(name);
  }),
};

export const revalidatePath = vi.fn();

export const headersMock = {
  cookies: async () => cookieJar,
  headers: async () => headerValues,
  draftMode: async () => ({ isEnabled: false }),
};

export const cacheMock = {
  revalidatePath,
  revalidateTag: vi.fn(),
};

export const navigationMock = {
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  permanentRedirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined, back: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
};

export const challengeTable = {
  rows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as Error | null,
};

export const dbClientMock = {
  getDb: () => ({
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        if (challengeTable.insertError) throw challengeTable.insertError;
        challengeTable.inserted.push(values);
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => challengeTable.rows }) }) }),
  }),
};

export async function serverMock(importOriginal: () => Promise<object>) {
  return { ...(await importOriginal()), connection: async () => undefined };
}

export function authStoreMock() {
  return {
    findUserByEmail: vi.fn(async (): Promise<AccountUser | null> => null),
    listOrganizationUsers: vi.fn(async (): Promise<AccountUser[]> => []),
    activeOwnerIds: vi.fn(async (): Promise<string[]> => []),
    recentFailedAttempts: vi.fn(async (): Promise<Date[]> => []),
    recordSignInAttempt: vi.fn(async () => undefined),
    createSession: vi.fn(async () => "new-session-token"),
    deleteSession: vi.fn(async () => undefined),
    deleteUserSessions: vi.fn(async () => undefined),
    userForSessionToken: vi.fn(async (token: string) => liveUsers.get(token) ?? null),
    insertUser: vi.fn(async () => "user_new"),
    createInvite: vi.fn(async () => "invite-token"),
    findInvite: vi.fn(async () => null),
    consumeInvite: vi.fn(async (): Promise<AccountUser | null> => null),
    createPasswordReset: vi.fn(async () => "reset-token"),
    consumePasswordReset: vi.fn(async (): Promise<AccountUser | null> => null),
    createEmailVerification: vi.fn(async () => "verify-token"),
    consumeEmailVerification: vi.fn(async (): Promise<AccountUser | null> => null),
    isEmailVerified: (user: Pick<AccountUser, "emailVerifiedAt">) => user.emailVerifiedAt !== null,
    completeConnectionTour: vi.fn(async () => undefined),
    reopenConnectionTour: vi.fn(async () => undefined),
    setUserAccess: vi.fn(async () => undefined),
    updateUserName: vi.fn(async () => undefined),
    deactivateUser: vi.fn(async () => undefined),
    writeAudit: vi.fn(async () => undefined),
    deleteOrganizationAccess: vi.fn(async () => undefined),
  };
}

export function resetRequest(input: { origin?: string | null; host?: string | null } = {}): void {
  cookieValues.clear();
  cookieValues.set(CSRF_COOKIE, CSRF);
  liveUsers.clear();
  challengeTable.rows = [];
  challengeTable.inserted = [];
  challengeTable.insertError = null;
  headerValues = new Headers();
  const host = input.host === undefined ? HOST : input.host;
  const origin = input.origin === undefined ? ORIGIN : input.origin;
  if (host !== null) headerValues.set("host", host);
  if (origin !== null) headerValues.set("origin", origin);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("APP_URL", "");
}

export function setCookie(name: string, value: string): void {
  cookieValues.set(name, value);
}

export function setHeader(name: string, value: string): void {
  headerValues.set(name, value);
}

export function accountUser(role: Role, overrides: Partial<AccountUser> = {}): AccountUser {
  return {
    id: `user_${role}`,
    organizationId: ORG,
    email: `${role}@harbourline.example`,
    name: `Test ${role}`,
    role,
    status: "active",
    entityScope: [],
    passwordHash: null,
    connectionTourCompletedAt: null,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function signInLive(role: Role, overrides: Partial<AccountUser> = {}): AccountUser {
  const user = accountUser(role, overrides);
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  const token = `session-${user.id}`;
  liveUsers.set(token, user);
  cookieValues.set(SESSION_COOKIE, token);
  return user;
}

export function signInDemo(role: Role, entityScope: string[] = []): { name: string; email: string } {
  vi.stubEnv("DATABASE_URL", "");
  const claims = { role, name: `Demo ${role}`, email: `demo-${role}@harbourline.example`, entityScope, exp: Date.now() + 60_000 };
  cookieValues.set(DEMO_COOKIE, signDemoToken(claims));
  return claims;
}

export function actorOf(user: { name: string; email: string }): string {
  return `${user.name} <${user.email}>`;
}

export function form(fields: Record<string, string | File | undefined>, options: { csrf?: string | null } = {}): FormData {
  const data = new FormData();
  const csrf = options.csrf === undefined ? CSRF : options.csrf;
  if (csrf !== null) data.set("csrf", csrf);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) data.set(key, value);
  }
  return data;
}

export interface Redirect {
  url: string;
  pathname: string;
  params: URLSearchParams;
  external: boolean;
}

const RELATIVE_BASE = "http://relative.invalid";

export function parseRedirect(url: string): Redirect {
  const parsed = new URL(url, RELATIVE_BASE);
  return { url, pathname: parsed.pathname, params: parsed.searchParams, external: parsed.origin !== RELATIVE_BASE };
}

export async function redirectOf(run: Promise<unknown>): Promise<Redirect> {
  try {
    await run;
  } catch (error) {
    if (error instanceof RedirectSignal) return parseRedirect(error.url);
    throw error;
  }
  throw new Error("Expected the action to redirect, but it returned.");
}

export async function expectError(run: Promise<unknown>, pathname: string, message: string): Promise<Redirect> {
  const result = await redirectOf(run);
  expect(result.external).toBe(false);
  expect(result.pathname).toBe(pathname);
  expect(result.params.get("error")).toBe(message);
  expect(result.params.has("saved")).toBe(false);
  return result;
}

export async function expectSaved(run: Promise<unknown>, pathname: string, message: string): Promise<Redirect> {
  const result = await redirectOf(run);
  expect(result.external).toBe(false);
  expect(result.pathname).toBe(pathname);
  expect(result.params.get("saved")).toBe(message);
  expect(result.params.has("error")).toBe(false);
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  return result;
}

export const FORM_EXPIRED = "The form expired. Refresh and try again.";
export const CROSS_SITE = "Cross-site request blocked.";
export const NO_PERMISSION = "You do not have permission to do that.";
export const OUTSIDE_ACCESS = "That company is outside your access.";
