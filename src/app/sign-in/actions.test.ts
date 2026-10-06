import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COOKIE, SESSION_COOKIE } from "@/auth/cookies";
import { readDemoToken } from "@/auth/demo";
import { hashPassword, verifyPassword } from "@/auth/password";
import {
  consumeEmailVerification,
  consumeInvite,
  consumePasswordReset,
  createPasswordReset,
  createSession,
  deleteSession,
  findUserByEmail,
  recentFailedAttempts,
  recordSignInAttempt,
  userForSessionToken,
  writeAudit,
} from "@/db/auth-store";
import { deliver } from "@/email/links";
import {
  accountUser,
  cookieJar,
  CROSS_SITE,
  form,
  FORM_EXPIRED,
  ORG,
  redirectOf,
  resetRequest,
  SG,
  setCookie,
} from "@/test/server-harness";
import {
  acceptInviteAction,
  demoSignInAction,
  requestPasswordResetAction,
  resetPasswordAction,
  signInAction,
  signOutAction,
  verifyEmailAction,
} from "./actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/email/links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/email/links")>()),
  deliver: vi.fn(async () => ({ sent: true, provider: "test" })),
}));

const PASSWORD = "Harbourline-owner-1";
const SECRET = "test-auth-secret-that-is-at-least-32-chars";
let passwordHash = "";

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  resetRequest();
  vi.stubEnv("AUTH_SECRET", SECRET);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function withDatabase(): void {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
}

describe("signInAction", () => {
  beforeEach(withDatabase);

  it("signs in, replaces any demo cookie, and keeps a safe next path", async () => {
    const owner = accountUser("owner", { passwordHash });
    vi.mocked(findUserByEmail).mockResolvedValue(owner);
    setCookie(DEMO_COOKIE, "old-demo");
    const result = await redirectOf(signInAction(form({ email: " Owner@Harbourline.example ", password: PASSWORD, next: "/dashboard/reports?entity=x" })));
    expect(result.url).toBe("/dashboard/reports?entity=x");
    expect(findUserByEmail).toHaveBeenCalledWith("owner@harbourline.example");
    expect(createSession).toHaveBeenCalledWith(owner.id);
    expect(cookieJar.set).toHaveBeenCalledWith(SESSION_COOKIE, "new-session-token", expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
    expect(cookieJar.delete).toHaveBeenCalledWith(DEMO_COOKIE);
    expect(recordSignInAttempt).toHaveBeenCalledWith("owner@harbourline.example", true);
  });

  it.each(["https://evil.example/dashboard", "//evil.example/dashboard", "/dashboard\\@evil.example", "/settings"])(
    "ignores the unsafe next path %s",
    async (next) => {
      vi.mocked(findUserByEmail).mockResolvedValue(accountUser("owner", { passwordHash }));
      const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD, next })));
      expect(result.url).toBe("/dashboard");
    },
  );

  it("refuses a wrong password with the generic message and audits it", async () => {
    const owner = accountUser("owner", { passwordHash });
    vi.mocked(findUserByEmail).mockResolvedValue(owner);
    const result = await redirectOf(signInAction(form({ email: owner.email, password: "wrong-password-123", next: "/dashboard/ledger" })));
    expect(result.pathname).toBe("/sign-in");
    expect(result.params.get("error")).toBe("Email or password is wrong.");
    expect(result.params.get("next")).toBe("/dashboard/ledger");
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect(recordSignInAttempt).toHaveBeenCalledWith(owner.email, false);
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "auth.sign_in_failed", subjectId: owner.id });
  });

  it.each([
    ["an unknown email", null],
    ["an inactive user", accountUser("owner", { passwordHash, status: "inactive" })],
    ["an invited user with no password", accountUser("owner", { passwordHash: null, status: "invited" })],
  ])("gives %s the same generic message", async (_label, user) => {
    vi.mocked(findUserByEmail).mockResolvedValue(user);
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD })));
    expect(result.params.get("error")).toBe("Email or password is wrong.");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("locks out after repeated failures", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(accountUser("owner", { passwordHash }));
    vi.mocked(recentFailedAttempts).mockResolvedValue(Array.from({ length: 5 }, () => new Date(Date.now() - 60_000)));
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD })));
    expect(result.params.get("error")).toBe("Too many sign-in attempts. Try again in 14 minutes.");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("needs a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD })));
    expect(result.params.get("error")).toBe("Password sign-in needs DATABASE_URL. Use a demo role below, or configure Postgres.");
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("needs AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "short");
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD })));
    expect(result.params.get("error")).toBe("Set AUTH_SECRET to at least 32 characters before signing in.");
  });

  it("refuses a stale CSRF token and keeps the next path", async () => {
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD, next: "/dashboard/audit" }, { csrf: "stale" })));
    expect(result.pathname).toBe("/sign-in");
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(result.params.get("next")).toBe("/dashboard/audit");
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    withDatabase();
    const result = await redirectOf(signInAction(form({ email: "owner@harbourline.example", password: PASSWORD })));
    expect(result.params.get("error")).toBe(CROSS_SITE);
  });
});

describe("demoSignInAction", () => {
  it("signs a demo cookie for the chosen preview and drops any live session", async () => {
    setCookie(SESSION_COOKIE, "live");
    const result = await redirectOf(demoSignInAction(form({ preview: "viewer-sg", next: "/dashboard/reports" })));
    expect(result.url).toBe("/dashboard/reports");
    const token = vi.mocked(cookieJar.set).mock.calls.find(([name]) => name === DEMO_COOKIE)![1];
    expect(readDemoToken(token)).toMatchObject({ role: "viewer", email: "viewer.sg@harbourline.example", entityScope: [SG] });
    expect(cookieJar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("is disabled when a database is configured", async () => {
    withDatabase();
    const result = await redirectOf(demoSignInAction(form({ preview: "owner" })));
    expect(result.params.get("error")).toBe("Demo sign-in is disabled when a database or production is configured.");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await redirectOf(demoSignInAction(form({ preview: "owner" })));
    expect(result.params.get("error")).toBe("Demo sign-in is disabled when a database or production is configured.");
  });

  it("refuses an unknown preview", async () => {
    const result = await redirectOf(demoSignInAction(form({ preview: "root" })));
    expect(result.params.get("error")).toBe("Choose a demo role.");
  });

  it("refuses a stale CSRF token", async () => {
    const result = await redirectOf(demoSignInAction(form({ preview: "owner" }, { csrf: "stale" })));
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});

describe("acceptInviteAction", () => {
  beforeEach(withDatabase);

  it.each([
    ["accountant", "/dashboard"],
    ["admin", "/dashboard/setup"],
  ] as const)("sets the password and signs in a new %s", async (role, landing) => {
    const user = accountUser(role, { status: "active" });
    vi.mocked(consumeInvite).mockResolvedValue(user);
    const result = await redirectOf(acceptInviteAction(form({ invite: "invite-token", password: PASSWORD, confirm: PASSWORD })));
    expect(result.url).toBe(landing);
    const [token, hash] = vi.mocked(consumeInvite).mock.calls[0]!;
    expect(token).toBe("invite-token");
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(createSession).toHaveBeenCalledWith(user.id);
    expect(cookieJar.set).toHaveBeenCalledWith(SESSION_COOKIE, "new-session-token", expect.anything());
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ organizationId: ORG, action: "user.invite_accepted", subjectId: user.id });
  });

  it("refuses an invalid or expired invite", async () => {
    const result = await redirectOf(acceptInviteAction(form({ invite: "bad", password: PASSWORD, confirm: PASSWORD })));
    expect(result.params.get("error")).toBe("That invite link is invalid or expired.");
    expect(result.params.has("invite")).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    [{ confirm: "different-password-1" }, "The passwords do not match."],
    [{ password: "short", confirm: "short" }, "Use at least 12 characters."],
  ])("keeps the invite and explains %o", async (fields, message) => {
    const base = { invite: "invite-token", password: PASSWORD, confirm: PASSWORD };
    const result = await redirectOf(acceptInviteAction(form({ ...base, ...fields })));
    expect(result.params.get("error")).toBe(message);
    expect(result.params.get("invite")).toBe("invite-token");
    expect(consumeInvite).not.toHaveBeenCalled();
  });

  it("needs a database and AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const result = await redirectOf(acceptInviteAction(form({ invite: "invite-token", password: PASSWORD, confirm: PASSWORD })));
    expect(result.params.get("error")).toBe("Accepting an invite needs DATABASE_URL and AUTH_SECRET.");
  });

  it("refuses a stale CSRF token", async () => {
    const result = await redirectOf(acceptInviteAction(form({ invite: "invite-token", password: PASSWORD, confirm: PASSWORD }, { csrf: "stale" })));
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(result.params.get("invite")).toBe("invite-token");
  });
});

describe("signOutAction", () => {
  it("deletes the live session, audits, and clears both cookies", async () => {
    withDatabase();
    const user = accountUser("viewer");
    setCookie(SESSION_COOKIE, "live-token");
    vi.mocked(userForSessionToken).mockResolvedValue(user);
    const result = await redirectOf(signOutAction(form({})));
    expect(result.url).toBe("/sign-in");
    expect(deleteSession).toHaveBeenCalledWith("live-token");
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "auth.signed_out", subjectId: user.id });
    expect(cookieJar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
    expect(cookieJar.delete).toHaveBeenCalledWith(DEMO_COOKIE);
  });

  it("deletes an unknown session without auditing", async () => {
    withDatabase();
    setCookie(SESSION_COOKIE, "stale-token");
    await redirectOf(signOutAction(form({})));
    expect(deleteSession).toHaveBeenCalledWith("stale-token");
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("clears a demo session without touching a database", async () => {
    setCookie(DEMO_COOKIE, "demo");
    expect((await redirectOf(signOutAction(form({})))).url).toBe("/sign-in");
    expect(deleteSession).not.toHaveBeenCalled();
    expect(cookieJar.delete).toHaveBeenCalledWith(DEMO_COOKIE);
  });

  it("refuses a stale CSRF token and stays signed in", async () => {
    setCookie(SESSION_COOKIE, "live-token");
    const result = await redirectOf(signOutAction(form({}, { csrf: "stale" })));
    expect(result.pathname).toBe("/dashboard");
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(cookieJar.delete).not.toHaveBeenCalled();
  });
});

describe("requestPasswordResetAction", () => {
  const GENERIC = "If that email has an account, a reset link has been sent.";

  beforeEach(withDatabase);

  it("emails an active user a reset link and audits it", async () => {
    const user = accountUser("viewer");
    vi.mocked(findUserByEmail).mockResolvedValue(user);
    const result = await redirectOf(requestPasswordResetAction(form({ email: ` ${user.email.toUpperCase()} ` })));
    expect(result.pathname).toBe("/reset-password");
    expect(result.params.get("sent")).toBe(GENERIC);
    expect(findUserByEmail).toHaveBeenCalledWith(user.email);
    expect(createPasswordReset).toHaveBeenCalledWith(user.id, ORG);
    expect(vi.mocked(deliver).mock.calls[0]![0].text).toContain("https://ledger.test/reset-password?token=reset-token");
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "auth.password_reset_requested", subjectId: user.id });
  });

  it("answers an unknown email exactly like a known one", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(accountUser("viewer"));
    const known = await redirectOf(requestPasswordResetAction(form({ email: "viewer@harbourline.example" })));
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const unknown = await redirectOf(requestPasswordResetAction(form({ email: "nobody@example.com" })));
    expect(unknown.url).toBe(known.url);
    expect(createPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("sends nothing to an inactive user", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(accountUser("viewer", { status: "inactive" }));
    const result = await redirectOf(requestPasswordResetAction(form({ email: "viewer@harbourline.example" })));
    expect(result.params.get("sent")).toBe(GENERIC);
    expect(createPasswordReset).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it.each([
    ["no database", () => vi.stubEnv("DATABASE_URL", ""), "viewer@harbourline.example"],
    ["no email", () => undefined, "  "],
  ])("reports the generic message with %s", async (_label, arrange, email) => {
    arrange();
    const result = await redirectOf(requestPasswordResetAction(form({ email })));
    expect(result.params.get("sent")).toBe(GENERIC);
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token", async () => {
    const result = await redirectOf(requestPasswordResetAction(form({ email: "viewer@harbourline.example" }, { csrf: "stale" })));
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  beforeEach(withDatabase);

  it("sets the new password and sends the user to sign in", async () => {
    const user = accountUser("viewer");
    vi.mocked(consumePasswordReset).mockResolvedValue(user);
    const result = await redirectOf(resetPasswordAction(form({ token: "reset-token", password: PASSWORD, confirm: PASSWORD })));
    expect(result.pathname).toBe("/sign-in");
    expect(result.params.get("saved")).toBe("Password changed. Sign in with your new password.");
    const [token, hash] = vi.mocked(consumePasswordReset).mock.calls[0]!;
    expect(token).toBe("reset-token");
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "auth.password_reset", subjectId: user.id });
  });

  it("refuses an invalid or expired token", async () => {
    const result = await redirectOf(resetPasswordAction(form({ token: "bad", password: PASSWORD, confirm: PASSWORD })));
    expect(result.params.get("error")).toBe("That reset link is invalid or expired.");
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("keeps the token when the passwords do not match", async () => {
    const result = await redirectOf(resetPasswordAction(form({ token: "reset-token", password: PASSWORD, confirm: "different-password-1" })));
    expect(result.params.get("token")).toBe("reset-token");
    expect(result.params.get("error")).toBe("The passwords do not match.");
    expect(consumePasswordReset).not.toHaveBeenCalled();
  });

  it("needs a database and AUTH_SECRET", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await redirectOf(resetPasswordAction(form({ token: "reset-token", password: PASSWORD, confirm: PASSWORD })));
    expect(result.params.get("error")).toBe("Password reset needs DATABASE_URL and AUTH_SECRET.");
  });

  it("refuses a stale CSRF token and keeps the token", async () => {
    const result = await redirectOf(resetPasswordAction(form({ token: "a&b", password: PASSWORD, confirm: PASSWORD }, { csrf: "stale" })));
    expect(result.params.get("token")).toBe("a&b");
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
  });
});

describe("verifyEmailAction", () => {
  beforeEach(withDatabase);

  it("confirms the email and sends the user to sign in", async () => {
    const user = accountUser("viewer", { emailVerifiedAt: null });
    vi.mocked(consumeEmailVerification).mockResolvedValue(user);
    const result = await redirectOf(verifyEmailAction(form({ token: "verify-token" })));
    expect(result.pathname).toBe("/sign-in");
    expect(result.params.get("saved")).toBe("Email confirmed. You can sign in.");
    expect(consumeEmailVerification).toHaveBeenCalledWith("verify-token");
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "user.email_verified", subjectId: user.id });
  });

  it("refuses an invalid or expired token", async () => {
    const result = await redirectOf(verifyEmailAction(form({ token: "bad" })));
    expect(result.params.get("error")).toBe("That verification link is invalid or expired.");
  });

  it("needs a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await redirectOf(verifyEmailAction(form({ token: "verify-token" })));
    expect(result.params.get("error")).toBe("Verification needs a database.");
    expect(consumeEmailVerification).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token and keeps the token", async () => {
    const result = await redirectOf(verifyEmailAction(form({ token: "verify-token" }, { csrf: "stale" })));
    expect(result.pathname).toBe("/verify-email");
    expect(result.params.get("token")).toBe("verify-token");
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
  });
});
