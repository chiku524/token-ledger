"use client";

/**
 * Browser wiring for the signing flow. It is the only place `@solana/web3.js`
 * meets the wallet: the server produces a library-free plan, and this builds,
 * simulates, signs, submits and confirms it in the browser. The server never
 * holds a key and never signs.
 *
 * Import this only from client components: it pulls `@solana/web3.js`, which must
 * stay out of the dashboard Worker bundle.
 */
import { VersionedTransaction } from "@solana/web3.js";
import { RpcSolanaTransport } from "@/adapters/execution/solana/rpc-transport";
import type { SolanaTransport } from "@/adapters/execution/solana/types";
import { assembleTransaction } from "@/adapters/execution/solana/assemble";
import { runSigningFlow, type SigningOutcome } from "@/contracts/signing-flow";
import { signSolanaTransaction, type SolanaTransactionProvider } from "@/auth/wallet-transaction";
import type { PlannedInstruction } from "@/billing/service";
import type { TransactionPreview } from "@/contracts/preview";

export interface SignOnChainInput {
  /** The plan from the server: program, accounts, encoded data and preview. */
  instructions: PlannedInstruction[];
  preview: TransactionPreview;
  rpcUrl: string;
  cluster: string;
  wallet: SolanaTransactionProvider;
  /**
   * An already-connected wallet address, if any. Required for a wallet-standard
   * provider; an injected wallet reads it from the transaction's fee payer.
   */
  connectedAddress?: string | null;
}

/** Run build → simulate → sign → submit → confirm for a server-prepared plan. */
export async function signAndSubmitPlan(input: SignOnChainInput): Promise<SigningOutcome> {
  const transport: SolanaTransport = new RpcSolanaTransport({ url: input.rpcUrl, cluster: input.cluster });
  const feePayer = input.connectedAddress ?? input.preview.feePayer;
  return runSigningFlow<VersionedTransaction>({
    transport,
    getLatestBlockhash: async () => {
      const rpc = transport as RpcSolanaTransport;
      return rpc.getLatestBlockhash();
    },
    assemble: async ({ blockhash, lastValidBlockHeight }) => {
      const { transaction, prepared } = assembleTransaction({
        instructions: input.instructions,
        preview: input.preview,
        feePayer,
        recentBlockhash: blockhash,
        lastValidBlockHeight,
      });
      return { transaction, messageBase64: prepared.messageBase64 };
    },
    sign: async (transaction) => {
      const signed = await signSolanaTransaction(input.wallet, transaction, input.cluster);
      return base64FromBytes(signed.serialize());
    },
  });
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
