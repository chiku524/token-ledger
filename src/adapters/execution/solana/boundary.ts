/**
 * The execution boundary: simulate an unsigned transaction, then submit a
 * signed one and confirm finality. Two rules the plan makes mandatory:
 *
 * 1. Simulate before asking for a signature. A transaction that reverts in
 *    simulation is surfaced before the wallet is opened, not after.
 * 2. A submitted transaction is not settled. Only a finalized slot is evidence.
 *
 * The boundary holds no key: `simulate` takes an unsigned transaction the wallet
 * will sign, and `submit` takes the signed result. The transport is injected.
 */
import {
  ExecutionError,
  type ConfirmationResult,
  type PreparedTransaction,
  type Signature,
  type SimulationResult,
  type SolanaTransport,
} from "./types";

export interface SignedTransaction {
  /** The signature produced by the wallet. */
  signature: Signature;
  /** The signed wire transaction, base64. */
  wireTransactionBase64: string;
}

export class ExecutionBoundary {
  constructor(private readonly transport: SolanaTransport) {}

  /**
   * Simulate an unsigned transaction. Returns the result; the caller decides
   * whether to proceed. Never sends.
   */
  async simulate(prepared: PreparedTransaction): Promise<SimulationResult> {
    this.assertSameCluster(prepared.cluster);
    return this.transport.simulate(prepared.messageBase64);
  }

  /**
   * Re-simulate the signed transaction, then send it. Throws when the simulation
   * reverts, so a doomed transaction is not broadcast.
   */
  async submit(signed: SignedTransaction): Promise<Signature> {
    // A signed transaction is simulated against current state; a wallet may have
    // signed against a stale blockhash or the state may have changed.
    const simulation = await this.transport.simulate(signed.wireTransactionBase64);
    if (!simulation.ok) {
      throw new ExecutionError(
        `The transaction would revert, so it was not sent: ${simulation.error ?? simulation.logs.join(" ")}`,
      );
    }
    return this.transport.send(signed.wireTransactionBase64);
  }

  /**
   * The authoritative check: a signature is settled only when the cluster
   * reports it finalized. A "confirmed" or unknown result is not settled. This
   * is what a settlement projection must gate on.
   */
  async isFinalized(signature: Signature): Promise<boolean> {
    const result = await this.confirmationStatus(signature);
    return result.status === "finalized";
  }

  async confirmationStatus(signature: Signature): Promise<ConfirmationResult> {
    return this.transport.confirmationStatus(signature);
  }

  private assertSameCluster(cluster: string): void {
    if (cluster !== this.transport.cluster) {
      throw new ExecutionError(
        `The transaction targets ${cluster} but this boundary is bound to ${this.transport.cluster}.`,
      );
    }
  }
}
