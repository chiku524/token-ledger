/**
 * The Solana signing/submission boundary. Separate from the read-only source
 * adapters on purpose: nothing under src/adapters/sources signs, and nothing
 * here reads balances or movements. See docs/adr-solana-contracts.md.
 *
 * `assemble.ts` is deliberately NOT re-exported here: it imports
 * `@solana/web3.js`, and this barrel is loaded by server jobs. The client signing
 * flow imports `assemble.ts` directly so web3.js stays out of the Worker bundle.
 */
export { ExecutionBoundary, type SignedTransaction } from "./boundary";
export { RpcSolanaTransport, type RpcTransportOptions } from "./rpc-transport";
export { contractTransport } from "./transport";
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
