/**
 * The end-to-end signing flow for a contract action: fetch a blockhash, assemble
 * an unsigned transaction, simulate it, ask the wallet to sign, submit, then poll
 * until the cluster reports it finalized. This is the one place the pieces meet,
 * so Billing and Treasury pages share exactly one behaviour.
 *
 * It is transport- and library-agnostic by injection: `assemble` and `sign` are
 * supplied by the caller (the browser wiring uses `@solana/web3.js` and the
 * wallet), so the flow itself is tested offline with the in-memory transport and
 * no network. It holds no key and never trusts a client "success" — only a
 * finalized slot settles a transaction.
 */
import type { ConfirmationResult, Signature, SimulationResult, SolanaTransport } from "@/adapters/execution/solana/types";

export interface SigningFlow<TTransaction> {
  transport: SolanaTransport;
  /** Fetch a fresh blockhash and its last valid block height. */
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  /** Build the signable transaction and its base64 message. */
  assemble(input: {
    blockhash: string;
    lastValidBlockHeight: number;
  }): Promise<{ transaction: TTransaction; messageBase64: string }>;
  /** Ask the wallet to sign; returns the signed wire transaction as base64. */
  sign(transaction: TTransaction, messageBase64: string): Promise<string>;
  /** Polling: how many times to check, and the delay between checks. */
  poll?: { attempts: number; intervalMs: number };
  /** Injected sleep, so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

export type SigningOutcome =
  | { status: "finalized"; signature: Signature }
  | { status: "submitted"; signature: Signature; confirmation: ConfirmationResult }
  | { status: "simulation_failed"; simulation: SimulationResult }
  | { status: "failed"; signature: Signature; confirmation: ConfirmationResult }
  | { status: "error"; message: string };

const DEFAULT_POLL = { attempts: 20, intervalMs: 2_000 };

/**
 * Run the flow. Returns a discriminated outcome rather than throwing for an
 * expected result (a revert, a failure), so the caller can show it. A thrown
 * error (RPC down, wallet refused) is caught and returned as `error`.
 */
export async function runSigningFlow<TTransaction>(flow: SigningFlow<TTransaction>): Promise<SigningOutcome> {
  const sleep = flow.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    // 1. Simulate before asking for a signature, so a doomed transaction is not
    //    shown to the wallet.
    const { blockhash, lastValidBlockHeight } = await flow.getLatestBlockhash();
    const { transaction, messageBase64 } = await flow.assemble({ blockhash, lastValidBlockHeight });
    const simulation = await flow.transport.simulate(messageBase64);
    if (!simulation.ok) return { status: "simulation_failed", simulation };

    // 2. Sign, then submit. `submit` re-simulates the signed result before sending.
    const signedBase64 = await flow.sign(transaction, messageBase64);
    const signature = await flow.transport.send(signedBase64);

    // 3. Only a finalized slot is settled. Poll `confirmationStatus` and stop at
    //    the first non-pending result.
    const poll = flow.poll ?? DEFAULT_POLL;
    let confirmation = await flow.transport.confirmationStatus(signature);
    for (let attempt = 0; attempt < poll.attempts; attempt += 1) {
      if (confirmation.status === "finalized") return { status: "finalized", signature };
      if (confirmation.status === "failed" || confirmation.status === "expired") {
        return { status: "failed", signature, confirmation };
      }
      // "confirmed" is not yet settled; keep polling.
      await sleep(poll.intervalMs);
      confirmation = await flow.transport.confirmationStatus(signature);
    }
    // Still only confirmed after the poll budget: report it as submitted, not settled.
    return { status: "submitted", signature, confirmation };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The transaction could not be completed." };
  }
}
