import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { AuthShell, AuthSplit } from "@/components/auth/auth-shell";
import { SignupOrbit } from "@/components/auth/signup-orbit";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { acceptInviteAction, demoSignInAction, signInAction } from "@/app/sign-in/actions";
import { ensureCsrf } from "@/auth/current";
import { DEMO_PREVIEWS } from "@/auth/demo-previews";
import { demoSignInAllowed } from "@/auth/demo";
import { safeNextPath } from "@/auth/csrf";
import { findInvite } from "@/db/auth-store";
import { hasDatabase } from "@/db/availability";
import { one } from "@/data/query";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; next?: string | string[]; invite?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = one(params.error);
  const saved = one(params.saved);
  const next = safeNextPath(one(params.next));
  const inviteToken = one(params.invite);
  const csrf = await ensureCsrf();
  const database = hasDatabase();
  const demo = demoSignInAllowed();
  const invite = inviteToken && database ? await findInvite(inviteToken) : null;

  return (
    <AuthShell
      kicker="Sign in"
      title="Sign in to the books."
      width="wide"
      tone="signin"
      ornament={<SignupOrbit />}
    >
      <AuthSplit
        aside={
          <section aria-labelledby="demo-heading" className="grid gap-3">
            <p className="eyebrow">Demo preview</p>
            <h2 id="demo-heading" className="text-lg font-semibold tracking-tight">
              Pick a role
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {demo
                ? "No database is connected, so you can look around as a sample Harbourline colleague. Nothing is saved. This preview is off in production and when a database is connected."
                : "The sample preview is off because a database is connected, or this is production. Use the password form."}
            </p>
            {demo ? (
              <ul className="mt-1 grid gap-2">
                {DEMO_PREVIEWS.map((preview) => (
                  <li key={preview.id}>
                    <form action={demoSignInAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="next" value={next} />
                      <input type="hidden" name="preview" value={preview.id} />
                      <SubmitButton variant="outline" className="h-auto w-full flex-col gap-0 py-2.5">
                        <span>{preview.label}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {preview.name} · {preview.email}
                        </span>
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Create an account to start a new organization, then connect a wallet, an exchange, a custodian, or all of
          them. An owner can also invite people into an organization that already exists.
        </p>
        {error ? (
          <Alert variant="destructive" className="mt-6">
            {error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert variant="success" role="status" className="mt-6">
            {saved}
          </Alert>
        ) : null}
        {invite ? (
          <FormCard action={acceptInviteAction} title="Accept invite" className="mt-6 border-0 bg-transparent p-0">
            <p className="text-sm text-muted-foreground">
              {invite.email}. Choose a password of at least 12 characters. This link is shown in the app. It is not emailed.
            </p>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="invite" value={inviteToken} />
            <Field label="Password">
              <Input name="password" type="password" required minLength={12} autoComplete="new-password" />
            </Field>
            <Field label="Confirm password">
              <Input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
            </Field>
            <SubmitButton className="h-11 w-full">Activate account</SubmitButton>
          </FormCard>
        ) : (
          <FormCard action={signInAction} title="Password" className="mt-6 border-0 bg-transparent p-0">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="next" value={next} />
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
            <SubmitButton className="h-11 w-full">Sign in</SubmitButton>
            <p className="text-sm text-muted-foreground">
              New organization?{" "}
              <Link href="/sign-up" className="text-link underline">
                Create an account
              </Link>
              {" · "}
              <Link href="/reset-password" className="text-link underline">
                Forgot password?
              </Link>
            </p>
            {database ? null : (
              <p className="text-sm text-muted-foreground">
                Password sign-in needs a database. The sample roles below work without one.
              </p>
            )}
          </FormCard>
        )}
      </AuthSplit>
    </AuthShell>
  );
}
