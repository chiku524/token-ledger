/**
 * Manual verification for the chain connectors (issues #45 / #42).
 *
 * Reads a real address through the live read-only adapters and prints the
 * assets held and the transactions. No key, no signing.
 *
 * Usage:
 *   pnpm chain:verify                              # Solana default address
 *   pnpm chain:verify solana <ADDRESS>
 *   pnpm chain:verify ethereum <ADDRESS> --limit 3
 *   pnpm chain:verify polygon  <ADDRESS>
 *
 * Loads .env.local and .env if present, so endpoints in .env.local (gitignored)
 * are used automatically.
 */
import { existsSync, readFileSync } from "node:fs";
import { EthereumChainAdapter, PolygonChainAdapter, SolanaChainAdapter } from "@/adapters/sources/chain";
import type { ChainSourceAdapter } from "@/adapters/types";
import { evmChain } from "@/adapters/sources/evm/chains";
import { describeEvmHoldings } from "@/adapters/sources/evm/map-balances";
import { toAssetHoldings } from "@/adapters/sources/solana/assets";
import { DEFAULT_MINT_REGISTRY } from "@/adapters/sources/solana/mints";
import { formatMinor } from "@/ledger";

const CHAINS = ["solana", "ethereum", "polygon"] as const;
type ChainName = (typeof CHAINS)[number];

const DEFAULT_ADDRESS: Record<ChainName, string> = {
  solana: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  ethereum: "0x28C6c06298d514Db089934071355E5743bf21d60",
  polygon: "0x0000000000000000000000000000000000001010",
};

function adapterFor(chain: ChainName): ChainSourceAdapter {
  if (chain === "solana") return new SolanaChainAdapter();
  if (chain === "ethereum") return new EthereumChainAdapter();
  return new PolygonChainAdapter();
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const args = process.argv.slice(2);
  const chain: ChainName = (CHAINS as readonly string[]).includes(args[0] ?? "") ? (args[0] as ChainName) : "solana";
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag === -1 ? 5 : Number(args[limitFlag + 1]);
  const address =
    args.find((arg) => arg !== chain && !arg.startsWith("--") && arg !== String(limit)) ?? DEFAULT_ADDRESS[chain];

  const adapter = adapterFor(chain);
  console.log(`Chain    : ${chain}`);
  console.log(`Adapter  : ${adapter.descriptor.name} (implemented: ${adapter.implemented})`);
  console.log(`Address  : ${address}\n`);

  const query = { since: "1970-01-01", externalAccountId: address };
  const accounts = await adapter.listAccounts(query);
  console.log(`Account  : ${accounts[0]?.name ?? "—"}\n`);

  const balances = await adapter.fetchBalances(query);
  const holdings =
    chain === "solana"
      ? toAssetHoldings(balances, DEFAULT_MINT_REGISTRY)
      : describeEvmHoldings(evmChain(chain)!, balances);
  console.log(`Assets held (${holdings.length}):`);
  for (const holding of holdings) {
    console.log(
      `  ${holding.assetCode.padEnd(6)} ${holding.name.padEnd(14)} ${holding.formatted.padStart(24)}  (${holding.decimals} dp)`,
    );
  }

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  let movements;
  try {
    movements = await adapter.fetchTransactions({ since, externalAccountId: address });
  } catch (error) {
    console.log(`\nTransactions: unavailable — ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  console.log(`\nTransactions (${movements.length}) since ${since}, showing up to ${limit}:`);
  const decimalsByCode = new Map(holdings.map((holding) => [holding.assetCode, holding.decimals]));
  for (const movement of movements.slice(0, limit)) {
    const decimals = decimalsByCode.get(movement.assetCode) ?? 18;
    const amount = formatMinor(movement.quantityMinor, decimals, { grouping: false });
    console.log(
      `  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${amount.padStart(20)}  ${movement.externalId.slice(0, 22)}…`,
    );
  }
  console.log("\nOK: the live chain reader returned real data.");
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
  process.exitCode = 1;
});
