/**
 * The signing/submission boundary for the Token Ledger contracts. This is the
 * only write path to Solana and is kept strictly separate from the read-only
 * source adapters (chains, exchanges, custodians). A source adapter observes;
 * this module prepares and submits.
 *
 * The app never holds a customer signing key. A build step produces an unsigned
 * transaction for the customer's wallet to sign; this boundary simulates and
 * submits an already-signed transaction, then verifies finalized state. It must
 * never treat a client-supplied "success" as chain evidence: only a finalized
 * slot does.
 *
 * The concrete transport (an RPC client) is injected, so the boundary's logic —
 * simulation-before-send, finalized-only verification — is testable without a
 * network. See docs/adr-solana-contracts.md.
 */

/** A compiled instruction in a prepared transaction. */
export interface InstructionSummary {
  programId: string;
  /** Account addresses the instruction touches, in order. */
  accounts: string[];
  /** A human-readable action, e.g. "billing.collect". Never secret. */
  action: string;
}

/**
 * A prepared, unsigned transaction. `message` is an opaque, already-serialized
 * message the caller's wallet signs; `preview` is what the UI shows before a
 * signature. Building the message is the job of a per-instruction builder; this
 * boundary only carries the result.
 */
export interface PreparedTransaction {
  /** The cluster this transaction targets. */
  cluster: string;
  /** The base64-encoded wire message the wallet signs. */
  messageBase64: string;
  /** Recent blockhash the message was built against. */
  recentBlockhash: string;
  /** The last slot at which the blockhash is valid. */
  lastValidBlockHeight: number;
  /** What the transaction does, for the confirmation screen. */
  preview: {
    action: string;
    /** Exact amount in minor units, when the action moves a token. */
    amountMinor?: bigint;
    /** Asset, e.g. "USDC". */
    asset?: string;
    /** Recipient owner address, when the action pays someone. */
    recipient?: string;
    /** Network fee payer address. */
    feePayer: string;
    instructions: InstructionSummary[];
  };
}

/** A transaction signature, as base58. */
export type Signature = string;

export interface SimulationResult {
  ok: boolean;
  /** Program logs from the simulation, for a failure message. */
  logs: string[];
  /** Units consumed, when reported. */
  unitsConsumed?: number;
  /** The error, when the simulation failed. */
  error?: string;
}

export interface ConfirmationResult {
  signature: Signature;
  /** How the transaction was confirmed. */
  status: "finalized" | "confirmed" | "expired" | "failed";
  slot?: number;
  /** The error, when the transaction failed on-chain. */
  error?: string;
}

/**
 * The injected Solana transport. A real implementation talks to an RPC; a test
 * double answers from a script. It is deliberately narrow: everything the
 * boundary needs to simulate, submit and check finality.
 */
export interface SolanaTransport {
  /** The cluster this transport is bound to, for cross-cluster safety. */
  readonly cluster: string;
  /** Simulate an unsigned or signed wire transaction. Never throws on a revert. */
  simulate(wireTransactionBase64: string): Promise<SimulationResult>;
  /** Send a signed wire transaction. Returns its signature. */
  send(wireTransactionBase64: string): Promise<Signature>;
  /** The finalization status of a signature, once known. */
  confirmationStatus(signature: Signature): Promise<ConfirmationResult>;
}

/** A build step: produce an unsigned transaction for a wallet to sign. */
export interface TransactionBuilder<Input> {
  /** The action name, e.g. "billing.collect". */
  readonly action: string;
  /** Build the unsigned transaction. Deterministic given its input. */
  build(input: Input): Promise<PreparedTransaction>;
}

export class ExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}
