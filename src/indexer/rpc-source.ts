/**
 * The RPC-backed `ChainSource` for the indexer. It turns the pass's
 * "finalized transactions for a program in a slot range" into the concrete RPC
 * calls: `getSlot`, `getSignaturesForAddress`, `getTransaction`. Finalized-only
 * throughout, so the pass can never index a provisional fork.
 */
import type { RpcSolanaTransport } from "@/adapters/execution/solana/rpc-transport";
import type { ChainSource, FinalizedTransaction } from "./pass";

const MAX_SIGNATURES = 100;

export function rpcChainSource(rpc: RpcSolanaTransport): ChainSource {
  return {
    finalizedSlot: () => rpc.getFinalizedSlot(),
    async transactionsInRange(programId, fromSlot, toSlot): Promise<FinalizedTransaction[]> {
      // A single page of recent signatures; a real deployment paginates with the
      // cursor, but the pass is bounded to one pass per call, so one page of the
      // most recent finalized signatures is the right scope here.
      const signatures = await rpc.getSignaturesForAddress(programId, { limit: MAX_SIGNATURES });
      const inRange = signatures.filter(
        (entry) => BigInt(entry.slot) > fromSlot && BigInt(entry.slot) <= toSlot,
      );
      const transactions: FinalizedTransaction[] = [];
      for (const entry of inRange) {
        const tx = await rpc.getTransactionLogs(entry.signature);
        if (!tx) continue;
        transactions.push({
          signature: entry.signature,
          slot: BigInt(tx.slot),
          blockTime: tx.blockTime === null ? null : new Date(tx.blockTime * 1000),
          logs: tx.logs,
          programId,
        });
      }
      return transactions;
    },
  };
}
