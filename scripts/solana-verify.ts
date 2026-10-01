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
 *
 * Loads .env.local and .env if present, so a private endpoint in .env.local
 * (gitignored) is used automatically.
 */
import { existsSync, readFileSync } from "node:fs";
import { SolanaChainAdapter } from "@/adapters/sources/chain";
import { SolanaReader } from "@/adapters/sources/solana/reader";
import { SolanaRpcClient } from "@/adapters/sources/solana/rpc";
import { DEFAULT_MINT_REGISTRY } from "@/adapters/sources/solana/mints";
import { isValidSolanaAddress } from "@/adapters/sources/solana/address";
import { readSolanaRpcUrl } from "@/env";

const DEFAULT_ADDRESS = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

/** Show the endpoint but never the secret in its query string. */
function redactEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, "REDACTED");
    }
    return parsed.toString();
  } catch {
    return "(unparseable endpoint)";
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

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
  console.log(`Endpoint : ${redactEndpoint(endpoint)}`);
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

/** Minimal .env loader, matching src/db/seed.ts. Existing process.env wins. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nFAILED: ${message}`);
  if (message.includes("429")) {
    console.error(
      "The endpoint rate-limits history. Retry, or set SOLANA_RPC_URL to a private endpoint (Helius, QuickNode, Chainstack).",
    );
  }
  process.exitCode = 1;
});

