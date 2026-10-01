/**
 * Manual verification for the Solana connector (issues #45 / #8).
 *
 * Reads a real address through the live read-only reader and prints the
 * observed balances and movements. No key, no signing.
 *
 * Usage:
 *   pnpm solana:verify                       # a well-known active mainnet address
 *   pnpm solana:verify <ADDRESS>
 *   pnpm solana:verify <ADDRESS> --limit 5   # cap history (public RPC is rate-limited)
 *   SOLANA_RPC_URL=https://your-endpoint pnpm solana:verify <ADDRESS>
 */
import { SolanaChainAdapter } from "@/adapters/sources/chain";
import { SolanaReader } from "@/adapters/sources/solana/reader";
import { SolanaRpcClient } from "@/adapters/sources/solana/rpc";
import { DEFAULT_MINT_REGISTRY } from "@/adapters/sources/solana/mints";
import { isValidSolanaAddress } from "@/adapters/sources/solana/address";
import { readSolanaRpcUrl } from "@/env";

const DEFAULT_ADDRESS = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

async function main() {
  const args = process.argv.slice(2);
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag === -1 ? 3 : Number(args[limitFlag + 1]);
  const address = args.find((arg) => !arg.startsWith("--") && arg !== String(limit)) ?? DEFAULT_ADDRESS;

  if (!isValidSolanaAddress(address)) {
    console.error(`Not a valid Solana address: ${address}`);
    process.exitCode = 1;
    return;
  }

  const endpoint = readSolanaRpcUrl();
  console.log(`Endpoint : ${endpoint}`);
  console.log(`Address  : ${address}\n`);

  const adapter = new SolanaChainAdapter();
  console.log(`Adapter  : ${adapter.descriptor.name} (implemented: ${adapter.implemented})\n`);

  const balances = await adapter.fetchBalances({ since: "1970-01-01", externalAccountId: address });
  console.log(`Observed balances (${balances.length}):`);
  for (const balance of balances) {
    console.log(`  ${balance.assetCode.padEnd(6)} ${balance.quantityMinor.toString().padStart(20)}  as of ${balance.asOf}`);
  }

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  const reader = new SolanaReader(new SolanaRpcClient(), DEFAULT_MINT_REGISTRY);
  const movements = await reader.fetchTransactions(address, since, undefined, { maxSignatures: limit });
  console.log(`\nMovements (${movements.length}) since ${since}, up to ${limit} signatures:`);
  for (const movement of movements) {
    console.log(
      `  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${movement.quantityMinor.toString().padStart(20)}  ${movement.externalId.slice(0, 20)}…`,
    );
  }

  console.log("\nOK: the live Solana reader returned real data.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nFAILED: ${message}`);
  if (message.includes("429")) {
    console.error(
      "The public endpoint rate-limits history. Retry, or set SOLANA_RPC_URL to a private endpoint (Helius, QuickNode, Chainstack, publicnode).",
    );
  }
  process.exitCode = 1;
});
