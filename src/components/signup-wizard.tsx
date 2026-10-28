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
import { personalBooksName, type OrganizationAccountType } from "@/data/account-type";
import { WATCH_VENUES } from "@/data/connections";

/**
 * The third step is the Company for an organization and a short Details step for an
 * individual. Only an organization gets the Connections step here: an individual
 * connects a wallet or exchange with the Connect dialog right after signing up, when
 * there is a signed-in session to attach it to.
 */
export function stepsFor(accountType: OrganizationAccountType): readonly string[] {
  return accountType === "individual"
    ? ["Type", "Account", "Details", "Review"]
    : ["Type", "Account", "Company", "Connections", "Review"];
}

export function SignupWizard({
  csrf,
  error,
  defaultAccountType = "organization",
}: {
  csrf: string;
  error?: string;
  /** Which choice starts selected. Organization, as before, unless a caller says otherwise. */
  defaultAccountType?: OrganizationAccountType;
}) {
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<OrganizationAccountType>(defaultAccountType);
  const individual = accountType === "individual";
  const STEPS = stepsFor(accountType);
  const reviewStep = STEPS.length - 1;
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
    if (step === 2) {
      const data = new FormData(form);
      const personal = personalBooksName(String(data.get("name") ?? ""));
      setSummary({
        organization: individual ? personal : String(data.get("organizationName") ?? ""),
        company: individual ? personal : String(data.get("entityName") ?? ""),
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
          Token Ledger keeps books for a company or for one person. Pick the one that fits. You can add people and
          connections later.
        </p>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Account type</legend>
          <AccountTypeChoice
            value="organization"
            title="Organization"
            description="A company, fund, or treasury. Entities, approvals, and accountants."
            selected={accountType}
            onSelect={setAccountType}
          />
          <AccountTypeChoice
            value="individual"
            title="Individual"
            description="Your own holdings. No company details to fill in."
            selected={accountType}
            onSelect={(value) => {
              setAccountType(value);
              if (value === "individual") {
                // Connections are not asked for here, so a choice made earlier must not be submitted.
                setWallet(false);
                setExchange(false);
                setCustodian(false);
              }
            }}
          />
        </fieldset>
      </div>

      <div hidden={step !== 1} className="grid gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {individual
            ? "This starts your own books. You will be the owner. Right after you sign up you can connect a wallet or an exchange, or skip it and do it later."
            : "This starts a new set of books. You will be the owner. A wallet, exchange, or custodian can be connected on the next steps, or skipped and added later in Settings."}
        </p>
        <Field label="Your name">
          <Input name="name" required maxLength={80} autoComplete="name" data-step="1" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required maxLength={200} autoComplete="email" data-step="1" />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" required minLength={12} autoComplete="new-password" data-step="1" />
        </Field>
        <Field label="Confirm password">
          <Input name="confirm" type="password" required minLength={12} autoComplete="new-password" data-step="1" />
        </Field>
      </div>

      <div hidden={step !== 2} className="grid gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {individual
            ? "Your books are named after you. Pick the country and currency you report in. You can change them later."
            : "The organization holds the books. The company is the legal entity that will own the connections."}
        </p>
        {individual ? null : (
          <>
            <Field label="Organization">
              <Input name="organizationName" required maxLength={200} data-step="2" />
            </Field>
            <Field label="Company">
              <Input name="entityName" required maxLength={200} data-step="2" />
            </Field>
          </>
        )}
        <Field label="Country code">
          <Input
            key={accountType}
            name="jurisdiction"
            required
            maxLength={2}
            placeholder={individual ? "US" : "MY"}
            defaultValue={individual ? "US" : ""}
            className="uppercase"
            data-step="2"
          />
        </Field>
        <Field label="Currency">
          <NativeSelect key={accountType} name="functionalCurrency" defaultValue={individual ? "USD" : "MYR"} data-step="2">
            <NativeSelectOption value="MYR">MYR</NativeSelectOption>
            <NativeSelectOption value="SGD">SGD</NativeSelectOption>
            <NativeSelectOption value="USD">USD</NativeSelectOption>
          </NativeSelect>
        </Field>
        {individual ? null : (
          <Field label="Reporting standard">
            <Input name="reportingFramework" required defaultValue="IFRS" maxLength={40} data-step="2" />
          </Field>
        )}
      </div>

      {individual ? null : (
      <div hidden={step !== 3} className="grid gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connect a wallet, an exchange, a custodian, or all of them. Each one is read-only — scopes are balances and
          movements. A connection cannot withdraw, trade, or sign.
        </p>
        <ConnectionChoice
          title="Wallet"
          checked={wallet}
          onChange={setWallet}
          enabledName="walletEnabled"
          intro="Watch a public address."
        >
          <Field label="Name">
            <Input name="walletName" required={wallet} maxLength={200} disabled={!wallet} data-step="3" />
          </Field>
          <Field label="Network">
            <NativeSelect name="walletChain" defaultValue="ethereum" disabled={!wallet} data-step="3">
              {WATCH_VENUES.map((venue) => (
                <NativeSelectOption key={venue.key} value={venue.key}>
                  {venue.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Wallet type">
            <NativeSelect name="walletRole" defaultValue="hot" disabled={!wallet} data-step="3">
              <NativeSelectOption value="hot">Hot wallet</NativeSelectOption>
              <NativeSelectOption value="cold">Cold wallet</NativeSelectOption>
              <NativeSelectOption value="staking">Staking</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Address">
            <Input name="walletIdentifier" required={wallet} maxLength={200} disabled={!wallet} className="font-mono" data-step="3" />
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
            <Input name="exchangeName" required={exchange} maxLength={200} disabled={!exchange} data-step="3" />
          </Field>
          <Field label="Account ID">
            <Input
              name="exchangeIdentifier"
              required={exchange}
              maxLength={200}
              disabled={!exchange}
              className="font-mono"
              data-step="3"
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
            <Input name="custodianName" required={custodian} maxLength={200} disabled={!custodian} data-step="3" />
          </Field>
          <Field label="Network">
            <NativeSelect name="custodianChain" defaultValue="" disabled={!custodian} data-step="3">
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
              data-step="3"
            />
          </Field>
        </ConnectionChoice>
      </div>
      )}

      <div hidden={step !== reviewStep} className="grid gap-3 text-sm leading-relaxed">
        <p>
          <span className="text-muted-foreground">Account type. </span>
          {individual ? "Individual" : "Organization"}
        </p>
        <p>
          <span className="text-muted-foreground">{individual ? "Books. " : "Organization. "}</span>
          {summary.organization || "—"}
        </p>
        {individual ? null : (
        <p>
          <span className="text-muted-foreground">Company. </span>
          {summary.company || "—"}
        </p>
        )}
        <p>
          <span className="text-muted-foreground">Email. </span>
          {summary.email || "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Connections. </span>
          {individual ? "You will connect a wallet or exchange right after you sign up." : connectionSummary(wallet, exchange, custodian)}
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
            {step === reviewStep - 1 ? "Review" : "Continue"}
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

function AccountTypeChoice({
  value,
  title,
  description,
  selected,
  onSelect,
}: {
  value: OrganizationAccountType;
  title: string;
  description: string;
  selected: OrganizationAccountType;
  onSelect: (value: OrganizationAccountType) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm",
        selected === value && "border-primary bg-primary/5",
      )}
    >
      <input
        type="radio"
        className="mt-0.5 size-4 accent-brand"
        name="accountType"
        value={value}
        checked={selected === value}
        onChange={() => onSelect(value)}
        data-step="0"
      />
      <span>
        <span className="font-medium">{title}</span>
        <span className="mt-1 block text-muted-foreground">{description}</span>
      </span>
    </label>
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
          data-step="3"
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
