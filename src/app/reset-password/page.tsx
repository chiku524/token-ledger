import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";
import { ensureCsrf } from "@/auth/current";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/sign-in/actions";
import { one } from "@/data/query";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[]; sent?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = one(params.token);
  const error = one(params.error);
  const sent = one(params.sent);
  const csrf = await ensureCsrf();

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-md px-4 py-6 md:px-8">
        <p className="kicker">Account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{token ? "Set a new password" : "Reset your password"}</h1>
        {error ? (
          <p role="alert" className="mt-6 border border-seal/40 bg-paper-raised px-4 py-3 text-sm text-seal">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p role="status" className="mt-6 border border-pine/40 bg-paper-raised px-4 py-3 text-sm text-pine">
            {sent}
          </p>
        ) : null}
        {token ? (
          <form action={resetPasswordAction} className="mt-6 grid gap-3 panel p-4">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="token" value={token} />
            <label className="field">
              <span>New password</span>
              <input name="password" type="password" required minLength={12} autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
            </label>
            <SubmitButton>
              Set password
            </SubmitButton>
            <p className="text-sm text-ink-soft">Setting a new password signs out any other sessions.</p>
          </form>
        ) : (
          <form action={requestPasswordResetAction} className="mt-6 grid gap-3 panel p-4">
            <input type="hidden" name="csrf" value={csrf} />
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required autoComplete="username" />
            </label>
            <SubmitButton>
              Send reset link
            </SubmitButton>
          </form>
        )}
        <p className="mt-4 text-sm text-ink-soft">
          Remembered it?{" "}
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
