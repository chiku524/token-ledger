import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";
import { ensureCsrf } from "@/auth/current";
import { verifyEmailAction } from "@/app/sign-in/actions";
import { one } from "@/data/query";

export const metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = one(params.token);
  const error = one(params.error);
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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Confirm your email</h1>
        {error ? (
          <p role="alert" className="mt-6 border border-seal/40 bg-paper-raised px-4 py-3 text-sm text-seal">
            {error}
          </p>
        ) : null}
        {token ? (
          <form action={verifyEmailAction} className="mt-6 grid gap-3 panel p-4">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn">
              Confirm email
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-ink-soft">Open the confirmation link from your email to confirm your address.</p>
        )}
        <p className="mt-4 text-sm text-ink-soft">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
