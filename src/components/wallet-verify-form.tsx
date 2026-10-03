"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { issueOwnershipChallenge, verifyWalletOwnershipAction } from "@/app/dashboard/wallet-actions";
import { connectEvm, signEvm, signSolana, type Eip1193Provider, type SolanaSigner } from "@/auth/wallet-signer";
import type { OwnershipChain } from "@/auth/wallet-ownership";
import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption as Option } from "@/components/ui/native-select";
import type { Books } from "@/data/books";

const ReownConnect = dynamic(() => import("./reown-connect").then((mod) => mod.ReownConnect), { ssr: false });

export function WalletVerifyForm({
  books,
  csrf,
  next,
  projectId,
}: {
  books: Books;
  csrf: string;
  next: string;
  projectId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chain, setChain] = useState<OwnershipChain>("ethereum");

  async function prove(address: string, sign: (message: string) => Promise<string>) {
    const form = document.getElementById("verify-wallet") as HTMLFormElement | null;
    if (!form) return;
    const body = new FormData(form);
    body.set("address", address);
    body.set("chain", chain);
    setBusy(true);
    setError(null);
    try {
      const issued = await issueOwnershipChallenge(body);
      if ("error" in issued) {
        setError(issued.error);
        return;
      }
      const signature = await sign(issued.message);
      body.set("challengeId", issued.challengeId);
      body.set("signature", signature);
      await verifyWalletOwnershipAction(body);
    } catch (caught) {
      if (isRedirect(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "The wallet could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormCard
      id="verify-wallet"
      description="The wallet signs a message that names this site, this organization, and this address. The message says it does not authorize a transfer."
      className="scroll-mt-6 border-0 bg-transparent p-0 md:grid-cols-2"
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />
      <Field label="Company">
        <NativeSelect name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <Option key={entity.id} value={entity.id}>
              {entity.name}
            </Option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Name">
        <Input name="name" required maxLength={200} />
      </Field>
      <Field label="Network">
        <NativeSelect name="chain" value={chain} onChange={(event) => setChain(event.target.value as OwnershipChain)}>
          <Option value="ethereum">Ethereum</Option>
          <Option value="solana">Solana</Option>
          <Option value="polygon">Polygon</Option>
        </NativeSelect>
      </Field>
      <Field label="Wallet type">
        <NativeSelect name="role" defaultValue="hot">
          <Option value="hot">Hot wallet</Option>
          <Option value="cold">Cold wallet</Option>
          <Option value="staking">Staking</Option>
        </NativeSelect>
      </Field>
      <div className="flex flex-wrap gap-3 md:col-span-2">
        <Button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void installed(chain, prove, setError)}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Waiting for the wallet" : "Sign with installed wallet"}
        </Button>
        {projectId ? (
          <ReownConnect projectId={projectId} chain={chain} disabled={busy} onProve={prove} />
        ) : (
          <Button type="button" variant="secondary" disabled>
            WalletConnect is not configured
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger md:col-span-2">
          {error}
        </p>
      ) : null}
    </FormCard>
  );
}

async function installed(
  chain: OwnershipChain,
  prove: (address: string, sign: (message: string) => Promise<string>) => Promise<void>,
  setError: (message: string) => void,
) {
  const browser = window as Window & { ethereum?: Eip1193Provider; solana?: SolanaSigner };
  try {
    if (chain === "solana") {
      const provider = browser.solana;
      if (!provider) {
        setError("No Solana wallet was found in this browser. Install Phantom, or turn on WalletConnect.");
        return;
      }
      const connected = await provider.connect();
      const address = connected.publicKey.toString();
      await prove(address, async (message) => (await signSolana(provider, message)).signature);
      return;
    }
    const provider = browser.ethereum;
    if (!provider?.request) {
      setError("No Ethereum wallet was found in this browser. Install one, or turn on WalletConnect.");
      return;
    }
    const address = await connectEvm(provider);
    await prove(address, (message) => signEvm(provider, address, message));
  } catch (caught) {
    if (isRedirect(caught)) throw caught;
    setError(caught instanceof Error ? caught.message : "The wallet could not be verified.");
  }
}

function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}
