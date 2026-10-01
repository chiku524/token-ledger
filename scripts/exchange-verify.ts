/**
 * Manual verification for the exchange connectors (issue #9 / #54).
 *
 * Reads a real exchange account through the live read-only adapter and prints
 * the assets held and the movements. Requires a READ-ONLY key pair for the
 * venue. Credentials are read from the environment (or .env.local) and are
 * never printed.
 *
 *   KRAKEN_API_KEY / KRAKEN_API_SECRET
 *   BYBIT_API_KEY / BYBIT_API_SECRET
 *   BINANCE_API_KEY / BINANCE_API_SECRET
 *   GATE_API_KEY / GATE_API_SECRET
 *   BACKPACK_API_KEY / BACKPACK_API_SECRET
 *
 * Usage:
 *   pnpm exchange:verify kraken --limit 5
 *   pnpm exchange:verify bybit
 */
import { existsSync, readFileSync } from "node:fs";
import { createVenueConnector, listVenues } from "@/adapters";
import { formatUnits } from "@/adapters/sources/exchange/amounts";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const args = process.argv.slice(2);
  const venues = listVenues().map((venue) => venue.key);
  const venueKey = venues.includes(args[0] ?? "") ? args[0]! : "kraken";
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag === -1 ? 5 : Number(args[limitFlag + 1]);

  const prefix = venueKey.toUpperCase();
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim();
  const apiSecret = process.env[`${prefix}_API_SECRET`]?.trim();
  if (!apiKey || !apiSecret) {
    console.error(`Set ${prefix}_API_KEY and ${prefix}_API_SECRET (read-only) in .env.local or the environment.`);
    console.error(`Venues: ${venues.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Venue    : ${venueKey}`);
  console.log(`Key      : ••••••••${apiKey.slice(-4)} (read-only)\n`);

  const connector = createVenueConnector(venueKey, { apiKey, apiSecret });

  const balances = await connector.fetchBalances();
  console.log(`Assets held (${balances.length}):`);
  for (const balance of balances) {
    console.log(`  ${balance.assetCode.padEnd(8)} ${formatUnits(balance.quantityMinor, 8).padStart(24)}`);
  }

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  const movements = await connector.fetchTransactions(since);
  console.log(`\nMovements (${movements.length}) since ${since}, showing up to ${limit}:`);
  for (const movement of movements.slice(0, limit)) {
    console.log(`  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(8)} ${formatUnits(movement.quantityMinor, 8).padStart(24)}`);
  }

  console.log("\nOK: the live exchange reader returned real data.");
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
