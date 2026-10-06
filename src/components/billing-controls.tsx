"use client";

/**
 * Client controls for the Billing page. Each action asks the server to prepare a
 * plan, then simulates, signs, submits and confirms it in the browser via
 * `signAndSubmitPlan`. The server never signs; the wallet does.
 *
 * It uses the injected Solana wallet (`window.solana`). Reown-connected wallets
 * can be added later through the same `signAndSubmitPlan` entry point.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { prepareCreatePlan, prepareCreateVault, prepareDeposit, prepareRevoke, prepareWithdraw } from "@/app/dashboard/billing-actions";
import { signAndSubmitPlan } from "@/contracts/client/sign-and-submit";
import { deserializePlan, type SerializablePlan } from "@/contracts/serialize";
import { previewIsComplete } from "@/contracts/preview";
import type { InjectedTransactionProvider } from "@/auth/wallet-transaction";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

interface SolanaInjected {
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signTransaction?: InjectedTransactionProvider["signTransaction"];
}

declare global {
  interface Window {
    solana?: SolanaInjected;
  }
}

type Action = "create_vault" | "deposit" | "withdraw" | "revoke" | "create_plan";

const ACTION_LABELS: Record<Action, string> = {
  create_vault: "Create vault",
  deposit: "Deposit",
  withdraw: "Withdraw",
  revoke: "Cancel renewal",
  create_plan: "Publish plan",
};

const PREPARE = {
  create_vault: prepareCreateVault,
  deposit: prepareDeposit,
  withdraw: prepareWithdraw,
  revoke: prepareRevoke,
  create_plan: prepareCreatePlan,
} as const;

export function BillingAction({
  action,
  csrf,
  entityId,
  vaultId,
  cluster,
  rpcUrl,
  wallet,
  label,
  description,
}: {
  action: Action;
  csrf: string;
  entityId: string;
  vaultId?: string;
  cluster: string;
  rpcUrl: string;
  wallet: string;
  label?: string;
  description?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const provider = window.solana;
      if (!provider?.signTransaction) {
        throw new Error("No Solana wallet was found in this browser.");
      }
      const address = (await provider.connect()).publicKey.toString();
      formData.set("controller", address);

      const prepared = await PREPARE[action](formData);
      if ("error" in prepared) throw new Error(prepared.error);

      const plan: SerializablePlan = prepared.plan;
      const complete = previewIsComplete(plan.preview);
      if (!complete.ok) throw new Error(`This action is missing: ${complete.missing.join(", ")}.`);
      if (!wallet || address !== wallet) {
        throw new Error("Connect the wallet that controls this vault.");
      }

      const outcome = await signAndSubmitPlan({
        instructions: deserializePlan(plan),
        preview: plan.preview,
        rpcUrl,
        cluster,
        wallet: provider as InjectedTransactionProvider,
        connectedAddress: address,
      });
      if (outcome.status === "finalized") setMessage(`Confirmed on-chain: ${outcome.signature.slice(0, 12)}…`);
      else if (outcome.status === "submitted") setMessage("Submitted. Waiting for finality; refresh shortly.");
      else if (outcome.status === "simulation_failed") {
        setError(`The transaction would fail: ${outcome.simulation.error ?? outcome.simulation.logs.join(" ")}`);
      } else if (outcome.status === "failed") setError(outcome.confirmation.error ?? "The transaction failed on-chain.");
      else setError(outcome.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormCard
      action={submit}
      title={label ?? ACTION_LABELS[action]}
      description={description}
      className="mt-4 md:grid-cols-2"
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entityId" value={entityId} />
      {vaultId ? <input type="hidden" name="vaultId" value={vaultId} /> : null}
      {action === "create_plan" ? (
        <>
          <Field label="Price per 30-day period (USDC)">
            <Input name="price" required inputMode="decimal" placeholder="500.00" />
          </Field>
          <Field label="Maximum periods">
            <Input name="maxPeriods" required type="number" min={1} max={1000} defaultValue={12} />
          </Field>
        </>
      ) : null}
      {action === "deposit" || action === "withdraw" ? (
        <>
          <Field label="Amount (USDC)">
            <Input name="amount" required inputMode="decimal" placeholder="500.00" />
          </Field>
          <Field label="Your USDC account on this cluster">
            <Input name="tokenAccount" required className="font-mono" placeholder="Token account address" />
          </Field>
        </>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Waiting for wallet" : ACTION_LABELS[action]}
        </Button>
        {message ? <p className="mt-2 text-sm text-success">{message}</p> : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </FormCard>
  );
}

export function BillingEntitySelect({ entities }: { entities: readonly { id: string; name: string }[] }) {
  return (
    <Field label="Company">
      <NativeSelect name="entityId" required defaultValue={entities[0]?.id}>
        {entities.map((entity) => (
          <NativeSelectOption key={entity.id} value={entity.id}>
            {entity.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
