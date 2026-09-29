"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/auth/authenticate";
import { assertCsrf } from "@/auth/current";
import { cookieSecure, DEMO_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/auth/cookies";
import { DEMO_PREVIEWS } from "@/auth/demo-previews";
import { demoSignInAllowed, signDemoToken } from "@/auth/demo";
import { safeNextPath } from "@/auth/csrf";
import { hashPassword } from "@/auth/password";
import { consumeInvite, createSession, deleteSession, userForSessionToken, writeAudit } from "@/db/auth-store";
import { readDatabaseUrl, authSecretConfigured } from "@/env";
import { passwordFormSchema, firstIssue } from "@/data/validate";

export async function signInAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  try {
    await assertCsrf(formData);
  } catch (error) {
    redirect(signInPath(messageOf(error), next));
  }
  if (!readDatabaseUrl()) {
    redirect(signInPath("Password sign-in needs DATABASE_URL. Use a demo role below, or configure Postgres.", next));
  }
  const result = await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) redirect(signInPath(result.message, next));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, result.token, sessionCookieOptions(cookieSecure()));
  jar.delete(DEMO_COOKIE);
  redirect(next);
}

export async function demoSignInAction(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  try {
    await assertCsrf(formData);
  } catch (error) {
    redirect(signInPath(messageOf(error), next));
  }
  if (!demoSignInAllowed()) {
    redirect(signInPath("Demo sign-in is disabled when a database or production is configured.", next));
  }
  const preview = DEMO_PREVIEWS.find((item) => item.id === String(formData.get("preview") ?? ""));
  if (!preview) redirect(signInPath("Choose a demo role.", next));
  const token = signDemoToken({
    role: preview.role,
    name: preview.name,
    email: preview.email,
    entityScope: [...preview.entityScope],
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  const jar = await cookies();
  jar.set(DEMO_COOKIE, token, sessionCookieOptions(cookieSecure()));
  jar.delete(SESSION_COOKIE);
  redirect(next);
}

export async function acceptInviteAction(formData: FormData) {
  const invite = String(formData.get("invite") ?? "");
  try {
    await assertCsrf(formData);
  } catch (error) {
    redirect(signInPath(messageOf(error), "/dashboard", invite));
  }
  if (!readDatabaseUrl() || !authSecretConfigured()) {
    redirect(signInPath("Accepting an invite needs DATABASE_URL and AUTH_SECRET.", "/dashboard", invite));
  }
  const parsed = passwordFormSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) redirect(signInPath(firstIssue(parsed.error), "/dashboard", invite));
  const user = await consumeInvite(invite, await hashPassword(parsed.data.password));
  if (!user) redirect(signInPath("That invite link is invalid or expired.", "/dashboard"));
  await writeAudit({
    organizationId: user.organizationId,
    actor: `${user.name} <${user.email}>`,
    action: "user.invite_accepted",
    subjectType: "user",
    subjectId: user.id,
    detail: "Invite accepted and password set.",
  });
  const token = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(cookieSecure()));
  jar.delete(DEMO_COOKIE);
  redirect("/dashboard");
}

export async function signOutAction(formData: FormData) {
  try {
    await assertCsrf(formData);
  } catch (error) {
    redirect(`/dashboard?error=${encodeURIComponent(messageOf(error))}`);
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && readDatabaseUrl()) {
    const user = await userForSessionToken(token);
    await deleteSession(token);
    if (user) {
      await writeAudit({
        organizationId: user.organizationId,
        actor: actorLine(user),
        action: "auth.signed_out",
        subjectType: "user",
        subjectId: user.id,
        detail: "Signed out.",
      });
    }
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(DEMO_COOKIE);
  redirect("/sign-in");
}

function actorLine(user: { name: string; email: string }): string {
  return `${user.name} <${user.email}>`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The form expired. Refresh and try again.";
}

function signInPath(error: string, next: string, invite?: string): string {
  const params = new URLSearchParams({ error, next });
  if (invite) params.set("invite", invite);
  return `/sign-in?${params.toString()}`;
}
