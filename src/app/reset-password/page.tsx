import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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
    <AuthShell kicker="Account" title={token ? "Set a new password" : "Reset your password"}>
      {error ? (
        <Alert variant="destructive" className="mt-6">
          {error}
        </Alert>
      ) : null}
      {sent ? (
        <Alert variant="success" role="status" className="mt-6">
          {sent}
        </Alert>
      ) : null}
      {token ? (
        <FormCard action={resetPasswordAction} className="mt-6 border-0 bg-transparent p-0">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="token" value={token} />
          <Field label="New password">
            <Input name="password" type="password" required minLength={12} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <Input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
          </Field>
          <SubmitButton className="h-11 w-full">Set password</SubmitButton>
          <p className="text-sm text-muted-foreground">Setting a new password signs out any other sessions.</p>
        </FormCard>
      ) : (
        <FormCard action={requestPasswordResetAction} className="mt-6 border-0 bg-transparent p-0">
          <input type="hidden" name="csrf" value={csrf} />
          <Field label="Email">
            <Input name="email" type="email" required autoComplete="username" />
          </Field>
          <SubmitButton className="h-11 w-full">Send reset link</SubmitButton>
        </FormCard>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/sign-in" className="text-link underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
