"use client";

/**
 * Client controls for the Treasury and Payables pages. Same shape as the Billing
 * controls: ask the server to prepare a plan, then simulate, sign, submit and
 * confirm it in the browser. The server never signs.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  createInvoiceAction,
  createSupplierAction,
  type PreparedPlan,
} from "@/app/dashboard/treasury-actions";
import { signAndSubmitPlan } from "@/contracts/client/sign-and-submit";
import { deserializePlan, type SerializablePlan } from "@/contracts/serialize";
import { previewIsComplete } from "@/contracts/preview";
import type { InjectedTransactionProvider } from "@/auth/wallet-transaction";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/app/form-card";

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

async function run(prepare: (form: FormData) => Promise<PreparedPlan>, rpcUrl: string, cluster: string, formData: FormData) {
  const provider = window.solana;
  if (!provider?.signTransaction) throw new Error("No Solana wallet was found in this browser.");
  const address = (await provider.connect()).publicKey.toString();
  formData.set("actor", address);
  const prepared = await prepare(formData);
  if ("error" in prepared) throw new Error(prepared.error);
  const plan: SerializablePlan = prepared.plan;
  const complete = previewIsComplete(plan.preview);
  if (!complete.ok) throw new Error(`This action is missing: ${complete.missing.join(", ")}.`);
  return signAndSubmitPlan({
    instructions: deserializePlan(plan),
    preview: plan.preview,
    rpcUrl,
    cluster,
    wallet: provider as InjectedTransactionProvider,
    connectedAddress: address,
  });
}

function outcomeMessage(outcome: Awaited<ReturnType<typeof signAndSubmitPlan>>): { ok?: string; error?: string } {
  if (outcome.status === "finalized") return { ok: `Confirmed on-chain: ${outcome.signature.slice(0, 12)}…` };
  if (outcome.status === "submitted") return { ok: "Submitted. Waiting for finality; refresh shortly." };
  if (outcome.status === "simulation_failed") return { error: `The transaction would fail: ${outcome.simulation.error ?? outcome.simulation.logs.join(" ")}` };
  if (outcome.status === "failed") return { error: outcome.confirmation.error ?? "The transaction failed on-chain." };
  return { error: outcome.message };
}

export function TreasuryAction({
  prepare,
  csrf,
  entityId,
  treasuryId,
  invoiceId,
  proposalId,
  cluster,
  rpcUrl,
  label,
  description,
  children,
}: {
  prepare: (form: FormData) => Promise<PreparedPlan>;
  csrf: string;
  entityId: string;
  treasuryId?: string;
  invoiceId?: string;
  proposalId?: string;
  cluster: string;
  rpcUrl: string;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = outcomeMessage(await run(prepare, rpcUrl, cluster, formData));
      if (result.ok) setMessage(result.ok);
      else setError(result.error ?? "The action could not be completed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormCard action={submit} title={label} description={description} className="mt-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entityId" value={entityId} />
      {treasuryId ? <input type="hidden" name="treasuryId" value={treasuryId} /> : null}
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      {proposalId ? <input type="hidden" name="proposalId" value={proposalId} /> : null}
      {children}
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Waiting for wallet" : label}
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

/** A plain record form that posts to a server action (no wallet, no chain). */
export function RecordForm({
  action,
  csrf,
  children,
  title,
  description,
}: {
  action: (formData: FormData) => Promise<void>;
  csrf: string;
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <FormCard action={action} title={title} description={description} className="mt-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      {children}
      <div className="md:col-span-2">
        <Button type="submit" variant="secondary">
          Save
        </Button>
      </div>
    </FormCard>
  );
}

export { createSupplierAction, createInvoiceAction };
