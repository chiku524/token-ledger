/**
 * A reference Solana transport that answers from a script. It is not an RPC; it
 * exists so the boundary's rules (simulate-before-send, finalized-only) can be
 * tested and demoed without a network, and so the boundary has an honest default
 * until a real RPC client is wired.
 *
 * A real transport is a thin wrapper over the Solana RPC's
 * `simulateTransaction`, `sendTransaction` and `getSignatureStatuses`. That
 * client is not added until an endpoint is configured; see the ADR.
 */
import type { ConfirmationResult, Signature, SimulationResult, SolanaTransport } from "./types";

export interface InMemoryTransportScript {
  /** Simulation results, consumed in order. The last repeats. */
  simulations?: SimulationResult[];
  /** Signatures, consumed in order. The last repeats. */
  signatures?: Signature[];
  /** Finalization status per signature. Unknown signatures read as not finalized. */
  confirmations?: Record<Signature, ConfirmationResult>;
}

export class InMemorySolanaTransport implements SolanaTransport {
  readonly cluster: string;
  private readonly simulations: SimulationResult[];
  private readonly signatures: Signature[];
  private readonly confirmations: Map<Signature, ConfirmationResult>;
  private simulated = 0;
  private sent = 0;

  constructor(cluster: string, script: InMemoryTransportScript = {}) {
    this.cluster = cluster;
    this.simulations = script.simulations?.length ? script.simulations : [{ ok: true, logs: [] }];
    this.signatures = script.signatures?.length ? script.signatures : ["sig-placeholder"];
    this.confirmations = new Map(Object.entries(script.confirmations ?? {}));
  }

  async simulate(_wireTransactionBase64: string): Promise<SimulationResult> {
    const result = this.simulations[Math.min(this.simulated, this.simulations.length - 1)]!;
    this.simulated += 1;
    return result;
  }

  async send(_wireTransactionBase64: string): Promise<Signature> {
    const signature = this.signatures[Math.min(this.sent, this.signatures.length - 1)]!;
    this.sent += 1;
    return signature;
  }

  async confirmationStatus(signature: Signature): Promise<ConfirmationResult> {
    return this.confirmations.get(signature) ?? { signature, status: "failed", error: "unknown signature" };
  }
}
