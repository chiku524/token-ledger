"use client";

import { useState } from "react";
import { signUpAction } from "@/app/sign-up/actions";
import { SubmitButton } from "@/components/submit-button";
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
    <form action={signUpAction} className="mt-6 grid gap-4 panel p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <p className="kicker">
        Signup · {step + 1} of {STEPS.length}
      </p>
      <h2 className="text-lg font-semibold tracking-tight">{STEPS[step]}</h2>
      {error && step === 0 ? (
        <p role="alert" className="border border-seal/40 px-4 py-3 text-sm text-seal">
          {error}
        </p>
      ) : null}

      <div hidden={step !== 0} className="grid gap-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          This starts a new set of books. You will be the owner. A wallet, exchange, or custodian can be connected on the
          next steps, or skipped and added later in Settings.
        </p>
        <label className="field">
          <span>Your name</span>
          <input name="name" required maxLength={80} autoComplete="name" data-step="0" />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" data-step="0" />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" required minLength={12} autoComplete="new-password" data-step="0" />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input name="confirm" type="password" required minLength={12} autoComplete="new-password" data-step="0" />
        </label>
      </div>

      <div hidden={step !== 1} className="grid gap-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          The organization holds the books. The company is the legal entity that will own the connections.
        </p>
        <label className="field">
          <span>Organization</span>
          <input name="organizationName" required maxLength={200} data-step="1" />
        </label>
        <label className="field">
          <span>Company</span>
          <input name="entityName" required maxLength={200} data-step="1" />
        </label>
        <label className="field">
          <span>Country code</span>
          <input name="jurisdiction" required maxLength={2} placeholder="MY" className="uppercase" data-step="1" />
        </label>
        <label className="field">
          <span>Currency</span>
          <select name="functionalCurrency" defaultValue="MYR" data-step="1">
            <option value="MYR">MYR</option>
            <option value="SGD">SGD</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="field">
          <span>Reporting standard</span>
          <input name="reportingFramework" required defaultValue="IFRS" maxLength={40} data-step="1" />
        </label>
      </div>

      <div hidden={step !== 2} className="grid gap-4">
        <p className="text-sm leading-relaxed text-ink-soft">
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
          <label className="field">
            <span>Name</span>
            <input name="walletName" required={wallet} maxLength={200} disabled={!wallet} data-step="2" />
          </label>
          <label className="field">
            <span>Network</span>
            <select name="walletChain" defaultValue="ethereum" disabled={!wallet} data-step="2">
              {WATCH_VENUES.map((venue) => (
                <option key={venue.key} value={venue.key}>
                  {venue.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Wallet type</span>
            <select name="walletRole" defaultValue="hot" disabled={!wallet} data-step="2">
              <option value="hot">Hot wallet</option>
              <option value="cold">Cold wallet</option>
              <option value="staking">Staking</option>
            </select>
          </label>
          <label className="field">
            <span>Address</span>
            <input name="walletIdentifier" required={wallet} maxLength={200} disabled={!wallet} className="font-mono text-sm" data-step="2" />
          </label>
        </ConnectionChoice>
        <ConnectionChoice
          title="Exchange"
          checked={exchange}
          onChange={setExchange}
          enabledName="exchangeEnabled"
          intro="Record an account id. Leave the wallet type blank."
        >
          <label className="field">
            <span>Name</span>
            <input name="exchangeName" required={exchange} maxLength={200} disabled={!exchange} data-step="2" />
          </label>
          <label className="field">
            <span>Account ID</span>
            <input
              name="exchangeIdentifier"
              required={exchange}
              maxLength={200}
              disabled={!exchange}
              className="font-mono text-sm"
              data-step="2"
            />
          </label>
        </ConnectionChoice>
        <ConnectionChoice
          title="Custodian"
          checked={custodian}
          onChange={setCustodian}
          enabledName="custodianEnabled"
          intro="Record a vault id. Add a network only when the vault has one."
        >
          <label className="field">
            <span>Name</span>
            <input name="custodianName" required={custodian} maxLength={200} disabled={!custodian} data-step="2" />
          </label>
          <label className="field">
            <span>Network</span>
            <select name="custodianChain" defaultValue="" disabled={!custodian} data-step="2">
              <option value="">None</option>
              {WATCH_VENUES.map((venue) => (
                <option key={venue.key} value={venue.key}>
                  {venue.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vault ID</span>
            <input
              name="custodianIdentifier"
              required={custodian}
              maxLength={200}
              disabled={!custodian}
              className="font-mono text-sm"
              data-step="2"
            />
          </label>
        </ConnectionChoice>
      </div>

      <div hidden={step !== 3} className="grid gap-3 text-sm leading-relaxed">
        <p>
          <span className="text-ink-soft">Organization. </span>
          {summary.organization || "—"}
        </p>
        <p>
          <span className="text-ink-soft">Company. </span>
          {summary.company || "—"}
        </p>
        <p>
          <span className="text-ink-soft">Email. </span>
          {summary.email || "—"}
        </p>
        <p>
          <span className="text-ink-soft">Connections. </span>
          {connectionSummary(wallet, exchange, custodian)}
        </p>
        <p className="text-ink-soft">Creating the account signs you in. Readers are not live yet, so a check sends nothing.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button type="button" className="btn-secondary" onClick={() => setStep((current) => current - 1)}>
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn" onClick={goNext}>
            {step === 2 ? "Review" : "Continue"}
          </button>
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
    <fieldset className="grid gap-3 border border-line p-3">
      <legend className="px-1 font-medium">{title}</legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name={enabledName}
          value="on"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          data-step="2"
        />
        <span>
          Connect this now
          <span className="mt-1 block text-ink-soft">{intro}</span>
        </span>
      </label>
      {checked ? children : null}
    </fieldset>
  );
}
