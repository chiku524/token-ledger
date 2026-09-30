import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignupWizard } from "@/components/signup-wizard";
import { ensureCsrf } from "@/auth/current";
import { readDatabaseUrl, authSecretConfigured } from "@/env";
import { one } from "@/data/query";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const error = one((await searchParams).error);
  const csrf = await ensureCsrf();
  const ready = Boolean(readDatabaseUrl()) && authSecretConfigured();

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 md:px-8">
        <Link href="/" className="font-serif text-xl tracking-tight">
          Token Ledger
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2 md:px-8">
        <section>
          <p className="text-[0.7rem] font-medium tracking-[0.18em] text-ink-soft uppercase">Create an account</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">Start with what you hold.</h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            The wizard asks for the organization, then a wallet, an exchange, a custodian, or any combination. Each
            connection only reads. It cannot move funds.
          </p>
          {ready ? (
            <SignupWizard csrf={csrf} error={error} />
          ) : (
            <p className="mt-6 border border-line bg-paper-raised px-4 py-3 text-sm text-ink-soft">
              Creating an account needs a database and AUTH_SECRET. Until then, the sample preview on the sign-in page is
              the way to look around.
            </p>
          )}
          <p className="mt-4 text-sm text-ink-soft">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>
          </p>
        </section>
        <section className="border border-line bg-paper-raised p-4">
          <p className="text-[0.7rem] font-medium tracking-[0.16em] text-seal uppercase">What gets saved</p>
          <h2 className="mt-2 font-serif text-2xl">Read-only from the start</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-ink-soft">
            <li>A wallet is a public address and a type: hot, cold, or staking.</li>
            <li>An exchange is an account id. An API key is not collected.</li>
            <li>A custodian is a vault id, with a network only when the vault has one.</li>
            <li>You can skip every connection and add them later in Settings.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
