/**
 * Fetch live asset prices and FX rates and store them with provenance.
 *
 * Read-only against the market sources; it never posts a journal. Needs
 * DATABASE_URL (there is nowhere to store a price without it).
 *
 * Usage:
 *   pnpm market:refresh              # prices + FX for every organization
 *   pnpm market:refresh <ORG_ID>     # one organization
 *   pnpm market:refresh --prices     # prices only
 *   pnpm market:refresh --fx         # FX only
 */
import { existsSync, readFileSync } from "node:fs";
import { readDatabaseUrl } from "@/env";
import { refreshAllAssetPrices, refreshAllFxRates, refreshAssetPrices, refreshFxRates } from "@/data/market-data";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  if (!readDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Prices need a database.");
    process.exitCode = 1;
    return;
  }

  const organizationId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const pricesOnly = process.argv.includes("--prices");
  const fxOnly = process.argv.includes("--fx");
  const doPrices = !fxOnly;
  const doFx = !pricesOnly;

  if (organizationId) {
    if (doPrices) console.log("Prices:", JSON.stringify(await refreshAssetPrices(organizationId)));
    if (doFx) console.log("FX:", JSON.stringify(await refreshFxRates(organizationId)));
    return;
  }

  if (doPrices) {
    const outcomes = await refreshAllAssetPrices();
    console.log(`Prices: ${outcomes.reduce((sum, outcome) => sum + outcome.stored, 0)} stored across ${outcomes.length} organization(s).`);
    for (const outcome of outcomes) if (outcome.skipped) console.log(`  skipped ${outcome.organizationId}: ${outcome.message}`);
  }
  if (doFx) {
    const outcomes = await refreshAllFxRates();
    console.log(`FX: ${outcomes.reduce((sum, outcome) => sum + outcome.stored, 0)} stored across ${outcomes.length} organization(s).`);
    for (const outcome of outcomes) if (outcome.skipped) console.log(`  skipped ${outcome.organizationId}: ${outcome.message}`);
  }
  console.log("OK: market data refreshed.");
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
