"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { issueOwnershipChallenge, verifyWalletOwnershipAction } from "@/app/dashboard/wallet-actions";
import { connectEvm, signEvm, signSolana, type Eip1193Provider, type SolanaSigner } from "@/auth/wallet-signer";
import type { OwnershipChain } from "@/auth/wallet-ownership";
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
    <form id="verify-wallet" className="grid scroll-mt-6 gap-3 panel p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />
      <h2 className="text-lg font-semibold tracking-tight md:col-span-2">Connect and sign</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft md:col-span-2">
        The wallet signs a message that names this site, this organization, and this address. The message says it does
        not authorize a transfer. Disconnecting the wallet later does not remove the address from the books.
      </p>
      <label className="field">
        <span>Company</span>
        <select name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} />
      </label>
      <label className="field">
        <span>Network</span>
        <select name="chain" value={chain} onChange={(event) => setChain(event.target.value as OwnershipChain)}>
          <option value="ethereum">Ethereum</option>
          <option value="solana">Solana</option>
          <option value="polygon">Polygon</option>
        </select>
      </label>
      <label className="field">
        <span>Wallet type</span>
        <select name="role" defaultValue="hot">
          <option value="hot">Hot wallet</option>
          <option value="cold">Cold wallet</option>
          <option value="staking">Staking</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-3 md:col-span-2">
        <button type="button" className="btn" disabled={busy} onClick={() => void installed(chain, prove, setError)}>
          {busy ? "Waiting for the wallet" : "Sign with installed wallet"}
        </button>
        {projectId ? (
          <ReownConnect projectId={projectId} chain={chain} disabled={busy} onProve={prove} />
        ) : (
          <button type="button" className="btn" disabled>
            WalletConnect is not configured
          </button>
        )}
      </div>
      {error ? <p className="text-sm text-seal md:col-span-2">{error}</p> : null}
    </form>
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
