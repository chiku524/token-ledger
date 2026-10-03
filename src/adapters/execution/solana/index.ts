/**
 * The Solana signing/submission boundary. Separate from the read-only source
 * adapters on purpose: nothing under src/adapters/sources signs, and nothing
 * here reads balances or movements. See docs/adr-solana-contracts.md.
 */
export { ExecutionBoundary, type SignedTransaction } from "./boundary";
export { InMemorySolanaTransport, type InMemoryTransportScript } from "./in-memory-transport";
export {
  ExecutionError,
  type ConfirmationResult,
  type InstructionSummary,
  type PreparedTransaction,
  type Signature,
  type SimulationResult,
  type SolanaTransport,
  type TransactionBuilder,
} from "./types";
