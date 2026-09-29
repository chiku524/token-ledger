import {
  createSession,
  findUserByEmail,
  recentFailedAttempts,
  recordSignInAttempt,
  writeAudit,
} from "@/db/auth-store";
import { authSecretConfigured } from "@/env";
import { LOCKOUT_WINDOW_MS, lockoutRemaining } from "./lockout";
import { hashPassword, verifyPassword } from "./password";

export type SignInResult = { ok: true; token: string } | { ok: false; message: string };

const GENERIC = "Email or password is wrong.";

let dummyHash: Promise<string> | undefined;

export async function authenticate(email: string, password: string, now = new Date()): Promise<SignInResult> {
  if (!authSecretConfigured()) {
    return { ok: false, message: "Set AUTH_SECRET to at least 32 characters before signing in." };
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return { ok: false, message: GENERIC };

  const [user, dummy] = await Promise.all([findUserByEmail(normalized), dummyPasswordHash()]);
  const since = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
  const failures = await recentFailedAttempts(normalized, since);
  const wait = lockoutRemaining(failures, now);
  if (wait > 0) {
    const minutes = Math.max(1, Math.ceil(wait / 60_000));
    return { ok: false, message: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? dummy);
  const active = user?.status === "active" && Boolean(user.passwordHash);
  if (!user || !active || !passwordOk) {
    await recordSignInAttempt(normalized, false);
    if (user) {
      await writeAudit({
        organizationId: user.organizationId,
        actor: user.email,
        action: "auth.sign_in_failed",
        subjectType: "user",
        subjectId: user.id,
        detail: "Failed sign-in.",
      });
    }
    return { ok: false, message: GENERIC };
  }

  await recordSignInAttempt(normalized, true);
  const token = await createSession(user.id);
  await writeAudit({
    organizationId: user.organizationId,
    actor: `${user.name} <${user.email}>`,
    action: "auth.signed_in",
    subjectType: "user",
    subjectId: user.id,
    detail: "Signed in.",
  });
  return { ok: true, token };
}

function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("token-ledger-dummy-password");
  return dummyHash;
}
