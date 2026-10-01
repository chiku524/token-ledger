/**
 * Manual verification for the Kraken exchange connector (issue #9).
 *
 * Reads a real Kraken account through the live read-only adapter and prints the
 * assets held and the movements. Requires a READ-ONLY Kraken API key:
 *
 *   KRAKEN_API_KEY, KRAKEN_API_SECRET   in .env.local (gitignored) or the env
 *
 * The key must have Query Funds, Query Ledger Entries, and Query Closed Orders
 * & Trades only — never Create & Modify Orders or Withdraw Funds. The key and
 * secret are never printed.
 *
 * Usage:
 *   pnpm exchange:verify
 *   pnpm exchange:verify --limit 5
 */
import { existsSync, readFileSync } from "node:fs";
import { KrakenExchangeAdapter } from "@/adapters/sources/exchange";
import { describeKrakenHoldings } from "@/adapters/sources/exchange/kraken-map";
import { KrakenClient } from "@/adapters/sources/exchange/kraken-client";
import { formatMinor } from "@/ledger";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const apiKey = process.env.KRAKEN_API_KEY?.trim();
  const apiSecret = process.env.KRAKEN_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    console.error("Set KRAKEN_API_KEY and KRAKEN_API_SECRET (read-only) in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag === -1 ? 5 : Number(args[limitFlag + 1]);

  const adapter = new KrakenExchangeAdapter({ credential: { apiKey, apiSecret } });
  console.log(`Adapter  : ${adapter.descriptor.name} (implemented: ${adapter.implemented})`);
  console.log(`Key      : ${"•".repeat(8)}${apiKey.slice(-4)} (read-only)\n`);

  const query = { since: "1970-01-01", externalAccountId: "kraken-main" };
  const accounts = await adapter.listAccounts(query);
  console.log(`Account  : ${accounts[0]?.name}\n`);

  const balances = await adapter.fetchBalances(query);
  const assets = await new KrakenClient({ apiKey, apiSecret }).getAssets();
  const holdings = describeKrakenHoldings(balances, assets);
  console.log(`Assets held (${holdings.length}):`);
  for (const holding of holdings) {
    console.log(`  ${holding.assetCode.padEnd(6)} ${holding.formatted.padStart(24)}  (${holding.decimals} dp)`);
  }

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  const movements = await adapter.fetchTransactions({ since, externalAccountId: "kraken-main" });
  console.log(`\nMovements (${movements.length}) since ${since}, showing up to ${limit}:`);
  const decimals = new Map(holdings.map((holding) => [holding.assetCode, holding.decimals]));
  for (const movement of movements.slice(0, limit)) {
    const amount = formatMinor(movement.quantityMinor, decimals.get(movement.assetCode) ?? 8, { grouping: false });
    console.log(`  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${amount.padStart(20)}`);
  }

  console.log("\nOK: the live Kraken reader returned real data.");
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
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
