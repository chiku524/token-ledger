/**
 * Manual verification for the Fireblocks custodian connector (issue #10).
 *
 * Requires a Viewer API user and its RSA private key:
 *   FIREBLOCKS_API_KEY      the API user id
 *   FIREBLOCKS_SECRET_KEY   the RSA private key PEM (may contain newlines)
 *
 * Read-only: the Viewer role cannot sign or move funds. The key and secret are
 * never printed. Use the sandbox base URL for a sandbox workspace:
 *   FIREBLOCKS_BASE_URL=https://sandbox-api.fireblocks.io/v1
 *
 * Usage:
 *   pnpm custodian:verify
 *   pnpm custodian:verify --vault 0 --limit 5
 */
import { existsSync, readFileSync } from "node:fs";
import { FireblocksClient } from "@/adapters/sources/custodian/fireblocks-client";
import { mapFireblocksWallets } from "@/adapters/sources/custodian/fireblocks-map";
import { FireblocksReader } from "@/adapters/sources/custodian/fireblocks-reader";
import { formatUnits } from "@/adapters/sources/exchange/amounts";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const apiKey = process.env.FIREBLOCKS_API_KEY?.trim();
  const privateKey = process.env.FIREBLOCKS_SECRET_KEY;
  if (!apiKey || !privateKey) {
    console.error("Set FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_KEY (Viewer, read-only) in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const vaultFlag = args.indexOf("--vault");
  const vaultAccountId = vaultFlag === -1 ? "0" : args[vaultFlag + 1]!;
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag === -1 ? 5 : Number(args[limitFlag + 1]);

  const client = new FireblocksClient(
    { apiKey, apiSecret: privateKey },
    { baseUrl: process.env.FIREBLOCKS_BASE_URL },
  );
  console.log(`Venue    : fireblocks`);
  console.log(`Key      : ••••••••${apiKey.slice(-4)} (Viewer, read-only)`);
  console.log(`Base URL : ${process.env.FIREBLOCKS_BASE_URL ?? "https://api.fireblocks.io/v1"}`);
  console.log(`Vault    : ${vaultAccountId}\n`);

  const paged = await client.getVaultAccounts();
  const wallets = mapFireblocksWallets(paged.accounts);
  console.log(`Vault accounts: ${paged.accounts.length}`);
  console.log(`Wallets (${wallets.length}), showing up to ${limit}:`);
  for (const wallet of wallets.slice(0, limit)) {
    console.log(`  vault ${wallet.vaultAccountId.padEnd(4)} ${wallet.assetCode.padEnd(6)} ${formatUnits(wallet.quantityMinor, wallet.decimals).padStart(20)}  ${wallet.network ?? "—"}`);
  }

  const reader = new FireblocksReader(client);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
  const movements = await reader.fetchTransactions(vaultAccountId, since);
  console.log(`\nMovements (${movements.length}) since ${since}, showing up to ${limit}:`);
  for (const movement of movements.slice(0, limit)) {
    console.log(`  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${formatUnits(movement.quantityMinor, 8).padStart(20)}`);
  }

  console.log("\nOK: the live Fireblocks reader returned real data.");
}

/** Minimal .env loader, matching src/db/seed.ts. Existing process.env wins. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  // Handle a quoted multi-line PEM value in the env file.
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (/^["']/.test(value) && !/["']$/.test(value.slice(1))) {
      // Multi-line quoted value.
      const quote = value[0];
      value = value.slice(1);
      i += 1;
      while (i < lines.length && !lines[i]!.trimEnd().endsWith(quote!)) {
        value += `\n${lines[i]}`;
        i += 1;
      }
      value += `\n${lines[i]!.trimEnd().slice(0, -1)}`;
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    if (key && process.env[key] === undefined) process.env[key] = value.replace(/\\n/g, "\n");
  }
}

main().catch((error: unknown) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
