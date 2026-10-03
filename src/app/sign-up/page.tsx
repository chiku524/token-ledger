import Link from "next/link";
import { AuthShell, AuthSplit } from "@/components/auth/auth-shell";
import { SignupOrbit } from "@/components/auth/signup-orbit";
import { Alert } from "@/components/ui/alert";
import { SignupWizard } from "@/components/signup-wizard";
import { ensureCsrf } from "@/auth/current";
import { hasDatabase } from "@/db/availability";
import { authSecretConfigured } from "@/env";
import { one } from "@/data/query";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const error = one((await searchParams).error);
  const csrf = await ensureCsrf();
  const ready = hasDatabase() && authSecretConfigured();

  return (
    <AuthShell kicker="Create an account" title="Start with what you hold." width="wide" ornament={<SignupOrbit />}>
      <AuthSplit
        aside={
          <section className="grid gap-3">
            <p className="eyebrow">What gets saved</p>
            <h2 className="text-lg font-semibold tracking-tight">Read-only from the start</h2>
            <ul className="grid gap-3 text-sm leading-relaxed text-muted-foreground">
              <li>A wallet is a public address and a type: hot, cold, or staking.</li>
              <li>An exchange is an account id. An API key is not collected.</li>
              <li>A custodian is a vault id, with a network only when the vault has one.</li>
              <li>You can skip every connection and add them later in Settings.</li>
            </ul>
          </section>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          The wizard asks for the organization, then a wallet, an exchange, a custodian, or any combination. Each
          connection only reads. It cannot move funds.
        </p>
        {ready ? (
          <SignupWizard csrf={csrf} error={error} />
        ) : (
          <Alert className="mt-6">
            Creating an account needs a database and AUTH_SECRET. Until then, the sample preview on the sign-in page is
            the way to look around.
          </Alert>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-link underline">
            Sign in
          </Link>
        </p>
      </AuthSplit>
    </AuthShell>
  );
}
