"use client";

import { useState } from "react";
import { signUpAction } from "@/app/sign-up/actions";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { WATCH_VENUES } from "@/data/connections";

const STEPS = ["Account", "Company", "Connections", "Review"] as const;

export function SignupWizard({ csrf, error }: { csrf: string; error?: string }) {
  const [step, setStep] = useState(0);
  const [wallet, setWallet] = useState(false);
  const [exchange, setExchange] = useState(false);
  const [custodian, setCustodian] = useState(false);
  const [summary, setSummary] = useState({ organization: "", company: "", email: "" });

  function goNext(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-step="${step}"]`);
    for (const field of fields) {
      if (field.disabled) continue;
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    if (step === 1) {
      const data = new FormData(form);
      setSummary({
        organization: String(data.get("organizationName") ?? ""),
        company: String(data.get("entityName") ?? ""),
        email: String(data.get("email") ?? ""),
      });
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  return (
    <form action={signUpAction} className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <div>
        <p className="eyebrow">
          Signup · {step + 1} of {STEPS.length}
        </p>
        <div aria-hidden className="mt-3 flex gap-1.5">
          {STEPS.map((name, index) => (
            <span key={name} className={cn("h-1 flex-1 rounded-full bg-border transition-colors", index <= step && "bg-primary")} />
          ))}
        </div>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{STEPS[step]}</h2>
      {error && step === 0 ? <Alert variant="destructive">{error}</Alert> : null}

      <div hidden={step !== 0} className="grid gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This starts a new set of books. You will be the owner. A wallet, exchange, or custodian can be connected on the
          next steps, or skipped and added later in Settings.
        </p>
        <Field label="Your name">
          <Input name="name" required maxLength={80} autoComplete="name" data-step="0" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required maxLength={200} autoComplete="email" data-step="0" />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" required minLength={12} autoComplete="new-password" data-step="0" />
        </Field>
        <Field label="Confirm password">
          <Input name="confirm" type="password" required minLength={12} autoComplete="new-password" data-step="0" />
        </Field>
      </div>

      <div hidden={step !== 1} className="grid gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The organization holds the books. The company is the legal entity that will own the connections.
        </p>
        <Field label="Organization">
          <Input name="organizationName" required maxLength={200} data-step="1" />
        </Field>
        <Field label="Company">
          <Input name="entityName" required maxLength={200} data-step="1" />
        </Field>
        <Field label="Country code">
          <Input name="jurisdiction" required maxLength={2} placeholder="MY" className="uppercase" data-step="1" />
        </Field>
        <Field label="Currency">
          <NativeSelect name="functionalCurrency" defaultValue="MYR" data-step="1">
            <NativeSelectOption value="MYR">MYR</NativeSelectOption>
            <NativeSelectOption value="SGD">SGD</NativeSelectOption>
            <NativeSelectOption value="USD">USD</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Reporting standard">
          <Input name="reportingFramework" required defaultValue="IFRS" maxLength={40} data-step="1" />
        </Field>
      </div>

      <div hidden={step !== 2} className="grid gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect a wallet, an exchange, a custodian, or all of them. Each one is read-only. This form does not ask for
          an API key, and a connection cannot withdraw, trade, or sign.
        </p>
        <ConnectionChoice
          title="Wallet"
          checked={wallet}
          onChange={setWallet}
          enabledName="walletEnabled"
          intro="Watch a public address."
        >
          <Field label="Name">
            <Input name="walletName" required={wallet} maxLength={200} disabled={!wallet} data-step="2" />
          </Field>
          <Field label="Network">
            <NativeSelect name="walletChain" defaultValue="ethereum" disabled={!wallet} data-step="2">
              {WATCH_VENUES.map((venue) => (
                <NativeSelectOption key={venue.key} value={venue.key}>
                  {venue.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Wallet type">
            <NativeSelect name="walletRole" defaultValue="hot" disabled={!wallet} data-step="2">
              <NativeSelectOption value="hot">Hot wallet</NativeSelectOption>
              <NativeSelectOption value="cold">Cold wallet</NativeSelectOption>
              <NativeSelectOption value="staking">Staking</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Address">
            <Input name="walletIdentifier" required={wallet} maxLength={200} disabled={!wallet} className="font-mono" data-step="2" />
          </Field>
        </ConnectionChoice>
        <ConnectionChoice
          title="Exchange"
          checked={exchange}
          onChange={setExchange}
          enabledName="exchangeEnabled"
          intro="Record an account id. Leave the wallet type blank."
        >
          <Field label="Name">
            <Input name="exchangeName" required={exchange} maxLength={200} disabled={!exchange} data-step="2" />
          </Field>
          <Field label="Account ID">
            <Input
              name="exchangeIdentifier"
              required={exchange}
              maxLength={200}
              disabled={!exchange}
              className="font-mono"
              data-step="2"
            />
          </Field>
        </ConnectionChoice>
        <ConnectionChoice
          title="Custodian"
          checked={custodian}
          onChange={setCustodian}
          enabledName="custodianEnabled"
          intro="Record a vault id. Add a network only when the vault has one."
        >
          <Field label="Name">
            <Input name="custodianName" required={custodian} maxLength={200} disabled={!custodian} data-step="2" />
          </Field>
          <Field label="Network">
            <NativeSelect name="custodianChain" defaultValue="" disabled={!custodian} data-step="2">
              <NativeSelectOption value="">None</NativeSelectOption>
              {WATCH_VENUES.map((venue) => (
                <NativeSelectOption key={venue.key} value={venue.key}>
                  {venue.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Vault ID">
            <Input
              name="custodianIdentifier"
              required={custodian}
              maxLength={200}
              disabled={!custodian}
              className="font-mono"
              data-step="2"
            />
          </Field>
        </ConnectionChoice>
      </div>

      <div hidden={step !== 3} className="grid gap-3 text-sm leading-relaxed">
        <p>
          <span className="text-muted-foreground">Organization. </span>
          {summary.organization || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Company. </span>
          {summary.company || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Email. </span>
          {summary.email || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Connections. </span>
          {connectionSummary(wallet, exchange, custodian)}
        </p>
        <p className="text-muted-foreground">Creating the account signs you in. Readers are not live yet, so a check sends nothing.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setStep((current) => current - 1)}>
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            {step === 2 ? "Review" : "Continue"}
          </Button>
        ) : (
          <SubmitButton pendingLabel="Creating account…">
            Create account
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

function connectionSummary(wallet: boolean, exchange: boolean, custodian: boolean): string {
  const chosen = [wallet ? "wallet" : "", exchange ? "exchange" : "", custodian ? "custodian" : ""].filter(Boolean);
  if (chosen.length === 0) return "None yet. You can add them in Settings.";
  return chosen.join(", ");
}

function ConnectionChoice({
  title,
  intro,
  checked,
  onChange,
  enabledName,
  children,
}: {
  title: string;
  intro: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  enabledName: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 font-medium">{title}</legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-brand"
          name={enabledName}
          value="on"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          data-step="2"
        />
        <span>
          Connect this now
          <span className="mt-1 block text-muted-foreground">{intro}</span>
        </span>
      </label>
      {checked ? children : null}
    </fieldset>
  );
}
