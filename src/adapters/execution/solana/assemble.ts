/**
 * Assemble a plan (program, accounts, encoded data) into a signable Solana
 * transaction. This is the step between a `BillingPlan`/`TreasuryPlan` and a
 * wallet signature; it holds no key and sends nothing.
 *
 * It uses `@solana/web3.js`, so it is imported only from the browser-side signing
 * flow — never from a dashboard server route — to keep the library out of the
 * Worker bundle. The plan itself is plain data the server can return.
 */
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { PlannedInstruction } from "@/billing/service";
import type { TransactionPreview } from "@/contracts/preview";
import type { InstructionSummary, PreparedTransaction } from "./types";
import { toBase64 } from "@/lib/webcrypto";

/** Turn program instructions into web3 instructions, resolving every account. */
export function toTransactionInstructions(instructions: readonly PlannedInstruction[]): TransactionInstruction[] {
  return instructions.map(
    (instruction) =>
      new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((account) => ({
          pubkey: new PublicKey(account.address),
          isSigner: account.signer,
          isWritable: account.writable,
        })),
        data: Buffer.from(instruction.data),
      }),
  );
}

/**
 * Build an unsigned v0 transaction for a plan. Deterministic given its inputs, so
 * the same plan and blockhash produce the same message.
 */
export function buildTransaction(input: {
  instructions: readonly PlannedInstruction[];
  feePayer: string;
  recentBlockhash: string;
}): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: new PublicKey(input.feePayer),
    recentBlockhash: input.recentBlockhash,
    instructions: toTransactionInstructions(input.instructions),
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

/** A one-line summary of an instruction, for the confirmation screen. Never secret. */
export function summarizeInstruction(instruction: PlannedInstruction, action: string): InstructionSummary {
  return {
    programId: instruction.programId,
    accounts: instruction.accounts.map((account) => account.address),
    action,
  };
}

/**
 * The wire form the boundary and the wallet agree on: the base64 message a wallet
 * signs, plus the preview the UI shows and the last valid block height.
 */
export function toPreparedTransaction(input: {
  transaction: VersionedTransaction;
  instructions: readonly PlannedInstruction[];
  preview: TransactionPreview;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}): PreparedTransaction {
  return {
    cluster: input.preview.cluster,
    messageBase64: toBase64(input.transaction.serialize()),
    recentBlockhash: input.recentBlockhash,
    lastValidBlockHeight: input.lastValidBlockHeight,
    preview: {
      action: input.preview.action,
      amountMinor: input.preview.amount ? BigInt(input.preview.amount.minor) : undefined,
      asset: input.preview.amount?.asset,
      recipient: input.preview.recipientOwner,
      feePayer: input.preview.feePayer,
      instructions: input.instructions.map((instruction) => summarizeInstruction(instruction, input.preview.action)),
    },
  };
}

/** Build and describe, in one call: an unsigned transaction plus its wire preview. */
export function assembleTransaction(input: {
  instructions: readonly PlannedInstruction[];
  preview: TransactionPreview;
  feePayer: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}): { transaction: VersionedTransaction; prepared: PreparedTransaction } {
  const transaction = buildTransaction({
    instructions: input.instructions,
    feePayer: input.feePayer,
    recentBlockhash: input.recentBlockhash,
  });
  return {
    transaction,
    prepared: toPreparedTransaction({
      transaction,
      instructions: input.instructions,
      preview: input.preview,
      recentBlockhash: input.recentBlockhash,
      lastValidBlockHeight: input.lastValidBlockHeight,
    }),
  };
}
