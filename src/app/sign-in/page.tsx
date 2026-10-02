import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { acceptInviteAction, demoSignInAction, signInAction } from "@/app/sign-in/actions";
import { ensureCsrf } from "@/auth/current";
import { DEMO_PREVIEWS } from "@/auth/demo-previews";
import { demoSignInAllowed } from "@/auth/demo";
import { safeNextPath } from "@/auth/csrf";
import { findInvite } from "@/db/auth-store";
import { readDatabaseUrl } from "@/env";
import { one } from "@/data/query";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[]; invite?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = one(params.error);
  const next = safeNextPath(one(params.next));
  const inviteToken = one(params.invite);
  const csrf = await ensureCsrf();
  const database = Boolean(readDatabaseUrl());
  const demo = demoSignInAllowed();
  const invite = inviteToken && database ? await findInvite(inviteToken) : null;

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-6 md:grid-cols-2 md:px-8">
        <section>
          <p className="kicker">Sign in</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to the books.</h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Create an account to start a new organization, then connect a wallet, an exchange, a custodian, or all of
            them. An owner can also invite people into an organization that already exists.
          </p>
          {error ? (
            <p role="alert" className="mt-6 border border-seal/40 bg-paper-raised px-4 py-3 text-sm text-seal">
              {error}
            </p>
          ) : null}
          {invite ? (
            <form action={acceptInviteAction} className="mt-6 grid gap-3 panel p-4">
              <h2 className="text-lg font-semibold tracking-tight">Accept invite</h2>
              <p className="text-sm text-ink-soft">
                {invite.email}. Choose a password of at least 12 characters. This link is shown in the app. It is not emailed.
              </p>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="invite" value={inviteToken} />
              <label className="field">
                <span>Password</span>
                <input name="password" type="password" required minLength={12} autoComplete="new-password" />
              </label>
              <label className="field">
                <span>Confirm password</span>
                <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
              </label>
              <button type="submit" className="btn">
                Activate account
              </button>
            </form>
          ) : (
            <form action={signInAction} className="mt-6 grid gap-3 panel p-4">
              <h2 className="text-lg font-semibold tracking-tight">Password</h2>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="next" value={next} />
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" required autoComplete="username" />
              </label>
              <label className="field">
                <span>Password</span>
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              <button type="submit" className="btn">
                Sign in
              </button>
              <p className="text-sm text-ink-soft">
                New organization?{" "}
                <Link href="/sign-up" className="underline">
                  Create an account
                </Link>
                {" · "}
                <Link href="/reset-password" className="underline">
                  Forgot password?
                </Link>
              </p>
              {database ? null : (
                <p className="text-sm text-ink-soft">Password sign-in needs a database. The sample roles on the right work without one.</p>
              )}
            </form>
          )}
        </section>
        <section className="panel p-4" aria-labelledby="demo-heading">
          <p className="kicker">Demo preview</p>
          <h2 id="demo-heading" className="mt-2 text-lg font-semibold tracking-tight">
            Pick a role
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {demo
              ? "No database is connected, so you can look around as a sample Harbourline colleague. Nothing is saved. This preview is off in production and when a database is connected."
              : "The sample preview is off because a database is connected, or this is production. Use the password form."}
          </p>
          {demo ? (
            <ul className="mt-4 grid gap-2">
              {DEMO_PREVIEWS.map((preview) => (
                <li key={preview.id}>
                  <form action={demoSignInAction}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="next" value={next} />
                    <input type="hidden" name="preview" value={preview.id} />
                    <button type="submit" className="btn-secondary w-full text-left">
                      {preview.label}
                      <span className="mt-1 block text-xs font-normal text-ink-soft">
                        {preview.name} · {preview.email}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  );
}
