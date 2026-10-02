import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormCard } from "@/components/app/form-card";
import { Alert } from "@/components/ui/alert";
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
    <AuthShell kicker="Account" title="Confirm your email">
      {error ? (
        <Alert variant="destructive" className="mt-6">
          {error}
        </Alert>
      ) : null}
      {token ? (
        <FormCard action={verifyEmailAction} className="mt-6">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="token" value={token} />
          <SubmitButton>Confirm email</SubmitButton>
        </FormCard>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Open the confirmation link from your email to confirm your address.</p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        <Link href="/sign-in" className="text-link underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
