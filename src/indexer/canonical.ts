/**
 * Canonical transfer identity. A generic wallet reader and a program-specific
 * indexer can observe the same on-chain transfer. Without one shared identity
 * they double-count. The identity is (cluster, signature, instruction location),
 * so both observations attach to the same movement.
 *
 * Also: detect a direct vault transfer even when the deposit instruction was
 * bypassed — the actual token balance is authoritative, and an unsolicited
 * deposit is still a funding event that must be seen.
 *
 * Pure: no database, no RPC.
 */
import type { QuantityDirection } from "@/ledger";

export interface InstructionLocation {
  instructionIndex: number;
  /** The inner-instruction path when the transfer is a CPI; empty for top level. */
  innerPath: number[];
}

/** One canonical transfer identity. Two observations with this key are the same movement. */
export interface CanonicalMovementId {
  cluster: string;
  signature: string;
  location: InstructionLocation;
}

/** How an observation was made. */
export type ObservationSource = "wallet_reader" | "program_indexer";

export interface MovementObservation {
  source: ObservationSource;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  /** The token account owner the movement is attributed to. */
  owner: string;
}

export function canonicalMovementKey(id: CanonicalMovementId): string {
  const inner = id.location.innerPath.length > 0 ? `:${id.location.innerPath.join(".")}` : "";
  return `${id.cluster}:${id.signature}:${id.location.instructionIndex}${inner}`;
}

/**
 * Merge observations of one movement. Both readers should agree on the asset
 * and direction; a disagreement is a real problem, surfaced rather than
 * silently resolved. The larger quantity wins only when one observer saw a
 * gross amount and the other a net — the plan says net deltas alone may hide
 * multiple operations, so the gross (larger) is the safer record and the
 * disagreement is flagged.
 */
export interface MergedMovement {
  key: string;
  assetCode: string;
  direction: QuantityDirection;
  quantityMinor: bigint;
  owners: string[];
  sources: ObservationSource[];
  /** True when observers disagreed on quantity (gross vs net). */
  ambiguous: boolean;
}

export function mergeObservations(id: CanonicalMovementId, observations: MovementObservation[]): MergedMovement {
  if (observations.length === 0) throw new Error("A movement needs at least one observation.");
  const [first, ...rest] = observations;
  let quantity = first!.quantityMinor;
  let ambiguous = false;
  for (const observation of rest) {
    if (observation.assetCode !== first!.assetCode || observation.direction !== first!.direction) {
      throw new Error(`Observers disagree on movement ${canonicalMovementKey(id)}.`);
    }
    if (observation.quantityMinor !== quantity) ambiguous = true;
    if (observation.quantityMinor > quantity) quantity = observation.quantityMinor;
  }
  return {
    key: canonicalMovementKey(id),
    assetCode: first!.assetCode,
    direction: first!.direction,
    quantityMinor: quantity,
    owners: [...new Set(observations.map((observation) => observation.owner))],
    sources: [...new Set(observations.map((observation) => observation.source))],
    ambiguous,
  };
}

/**
 * Link an internal transfer: the same movement where both the sender and the
 * recipient belong to the same entity. The plan keeps a separate link so an
 * internal move is not mistaken for an external one.
 */
export function internalTransferLink(key: string, senderEntityId: string, recipientEntityId: string): { key: string; internal: boolean } {
  return { key, internal: senderEntityId === recipientEntityId };
}

/**
 * A funding event for a controlled vault, detected from an observed balance
 * change regardless of whether the program's deposit instruction ran. A direct
 * USDC transfer into the vault is still a deposit for accounting purposes; the
 * actual balance is authoritative.
 */
export interface VaultFundingObservation {
  vaultAddress: string;
  assetCode: string;
  /** Positive when the vault's balance grew. */
  deltaMinor: bigint;
  /** The instruction that caused it, or null when it was a bare transfer. */
  causedBy: { signature: string; location: InstructionLocation } | null;
}

export function isUnsolicitedDeposit(observation: VaultFundingObservation): boolean {
  return observation.deltaMinor > 0n && observation.causedBy === null;
}

/** The deposit instruction's discriminator path: a real deposit is still a deposit. */
export function isBypassedDeposit(observation: VaultFundingObservation, depositProgram: string, programId: string): boolean {
  if (observation.deltaMinor <= 0n) return false;
  if (observation.causedBy === null) return true;
  return programId !== depositProgram;
}
