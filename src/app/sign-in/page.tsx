import Link from "next/link";
import { acceptInviteAction, demoSignInAction, signInAction } from "@/app/sign-in/actions";
import { ensureCsrf } from "@/auth/current";
import { DEMO_PREVIEWS } from "@/auth/demo-previews";
import { demoSignInAllowed } from "@/auth/demo";
import { safeNextPath } from "@/auth/csrf";
import { findInvite } from "@/db/auth-store";
import { readDatabaseUrl } from "@/env";
import { one } from "@/data/query";

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
      <header className="border-b border-line px-4 py-4 md:px-8">
        <Link href="/" className="font-serif text-xl tracking-tight">
          Token Ledger
        </Link>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2 md:px-8">
        <section>
          <p className="text-[0.7rem] font-medium tracking-[0.18em] text-ink-soft uppercase">Sign in</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">Books for the people who keep them.</h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            There is no public signup. An owner creates the first account from the command line, then invites the rest.
            Passwords are hashed and the session cookie is httpOnly.
          </p>
          {error ? (
            <p role="alert" className="mt-6 border border-seal/40 bg-paper-raised px-4 py-3 text-sm text-seal">
              {error}
            </p>
          ) : null}
          {invite ? (
            <form action={acceptInviteAction} className="mt-6 grid gap-3 border border-line bg-paper-raised p-4">
              <h2 className="font-serif text-2xl">Accept invite</h2>
              <p className="text-sm text-ink-soft">
                {invite.email} · set a password of at least 12 characters. This invite is a prototype link, not an email.
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
            <form action={signInAction} className="mt-6 grid gap-3 border border-line bg-paper-raised p-4">
              <h2 className="font-serif text-2xl">Password</h2>
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
              {database ? null : (
                <p className="text-sm text-ink-soft">Password sign-in needs Postgres. The demo roles on the right work without it.</p>
              )}
            </form>
          )}
        </section>
        <section className="border border-line bg-paper-raised p-4" aria-labelledby="demo-heading">
          <p className="text-[0.7rem] font-medium tracking-[0.16em] text-seal uppercase">Demo preview</p>
          <h2 id="demo-heading" className="mt-2 font-serif text-2xl">
            Pick a role
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {demo
              ? "No database is configured, so this preview signs you in as a fictional Harbourline colleague. Nothing is saved. Demo sign-in cannot run in production or when DATABASE_URL is set."
              : "Demo sign-in is off because a database or production environment is configured. Use the password form."}
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
