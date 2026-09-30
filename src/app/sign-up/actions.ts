"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertCsrf } from "@/auth/current";
import { cookieSecure, DEMO_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/auth/cookies";
import { hashPassword } from "@/auth/password";
import { parseSignup } from "@/data/signup";
import { createSession, findUserByEmail } from "@/db/auth-store";
import { registerOrganization } from "@/db/register";
import { BooksWriteError } from "@/db/write";
import { authSecretConfigured, readDatabaseUrl } from "@/env";

export async function signUpAction(formData: FormData) {
  try {
    await assertCsrf(formData);
  } catch (error) {
    redirect(signUpPath(messageOf(error)));
  }
  if (!readDatabaseUrl() || !authSecretConfigured()) {
    redirect(signUpPath("Creating an account needs DATABASE_URL and AUTH_SECRET."));
  }

  const parsed = parseSignup(formData);
  if (!parsed.ok) redirect(signUpPath(parsed.message));

  const existing = await findUserByEmail(parsed.value.account.email);
  if (existing) redirect(signUpPath("That email already has an account. Sign in instead."));

  try {
    const created = await registerOrganization({
      ownerName: parsed.value.account.name,
      email: parsed.value.account.email,
      passwordHash: await hashPassword(parsed.value.account.password),
      organizationName: parsed.value.company.organizationName,
      entityName: parsed.value.company.entityName,
      jurisdiction: parsed.value.company.jurisdiction,
      functionalCurrency: parsed.value.company.functionalCurrency,
      reportingFramework: parsed.value.company.reportingFramework,
      connections: parsed.value.connections,
    });
    const token = await createSession(created.userId);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, sessionCookieOptions(cookieSecure()));
    jar.delete(DEMO_COOKIE);
  } catch (error) {
    redirect(signUpPath(error instanceof BooksWriteError ? error.message : "The account could not be created."));
  }

  const connected = parsed.value.connections.length;
  const saved =
    connected === 0
      ? "Account created. You can connect a wallet, an exchange, or a custodian from Settings."
      : `Account created with ${connected} read-only connection${connected === 1 ? "" : "s"}. No key was stored.`;
  redirect(`/dashboard/settings?saved=${encodeURIComponent(saved)}`);
}

function signUpPath(error: string): string {
  return `/sign-up?error=${encodeURIComponent(error)}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The form expired. Refresh and try again.";
}
