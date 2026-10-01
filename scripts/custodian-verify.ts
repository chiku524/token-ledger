/**
 * Manual verification for the custodian connectors (issue #10 / #57).
 *
 * Requires a read-only credential for the provider. Credentials are read from
 * the environment (or .env.local) and are never printed.
 *
 *   BitGo:      BITGO_ACCESS_TOKEN
 *               BITGO_BASE_URL (optional; default https://www.bitgo.com, test: https://app.bitgo-test.com)
 *   Fireblocks: FIREBLOCKS_API_KEY + FIREBLOCKS_SECRET_KEY (Viewer, read-only RSA PEM)
 *               FIREBLOCKS_BASE_URL (optional; sandbox: https://sandbox-api.fireblocks.io/v1)
 *
 * Usage:
 *   pnpm custodian:verify bitgo --coin btc --limit 5
 *   pnpm custodian:verify fireblocks --vault 0
 */
import { existsSync, readFileSync } from "node:fs";
import { BitGoClient } from "@/adapters/sources/custodian/bitgo-client";
import { mapBitGoWallets } from "@/adapters/sources/custodian/bitgo-map";
import { BitGoReader } from "@/adapters/sources/custodian/bitgo-reader";
import { FireblocksClient } from "@/adapters/sources/custodian/fireblocks-client";
import { mapFireblocksWallets } from "@/adapters/sources/custodian/fireblocks-map";
import { FireblocksReader } from "@/adapters/sources/custodian/fireblocks-reader";
import { formatUnits } from "@/adapters/sources/exchange/amounts";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const args = process.argv.slice(2);
  const provider = ["bitgo", "fireblocks"].includes(args[0] ?? "") ? args[0]! : "bitgo";
  const flag = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args[i + 1]!;
  };
  const limit = Number(flag("--limit", "5"));
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);

  if (provider === "bitgo") {
    const token = process.env.BITGO_ACCESS_TOKEN?.trim();
    if (!token) {
      console.error("Set BITGO_ACCESS_TOKEN (view-only) in .env.local or the environment.");
      process.exitCode = 1;
      return;
    }
    const coin = flag("--coin", "btc");
    const client = new BitGoClient({ apiKey: token, apiSecret: "" }, { baseUrl: process.env.BITGO_BASE_URL });
    console.log(`Provider : bitgo`);
    console.log(`Key      : ••••••••${token.slice(-4)} (view-only)`);
    console.log(`Base URL : ${process.env.BITGO_BASE_URL ?? "https://www.bitgo.com"}`);
    console.log(`Coin     : ${coin}\n`);

    const rows = mapBitGoWallets(await client.getBalances());
    console.log(`Balances (${rows.length}), showing up to ${limit}:`);
    for (const row of rows.slice(0, limit)) {
      console.log(`  ${row.assetCode.padEnd(6)} ${formatUnits(row.quantityMinor, row.decimals).padStart(24)}  ${row.network ?? "—"}  ${row.label ?? ""}`);
    }
    const reader = new BitGoReader(client);
    const movements = await reader.fetchTransactions(coin, since);
    console.log(`\nMovements for ${coin} (${movements.length}) since ${since}:`);
    for (const movement of movements.slice(0, limit)) {
      console.log(`  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${formatUnits(movement.quantityMinor, 8).padStart(20)}`);
    }
  } else {
    const apiKey = process.env.FIREBLOCKS_API_KEY?.trim();
    const privateKey = process.env.FIREBLOCKS_SECRET_KEY;
    if (!apiKey || !privateKey) {
      console.error("Set FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_KEY (Viewer, read-only) in .env.local or the environment.");
      process.exitCode = 1;
      return;
    }
    const vault = flag("--vault", "0");
    const client = new FireblocksClient({ apiKey, apiSecret: privateKey }, { baseUrl: process.env.FIREBLOCKS_BASE_URL });
    console.log(`Provider : fireblocks`);
    console.log(`Key      : ••••••••${apiKey.slice(-4)} (Viewer, read-only)`);
    console.log(`Vault    : ${vault}\n`);

    const rows = mapFireblocksWallets((await client.getVaultAccounts()).accounts);
    console.log(`Wallets (${rows.length}), showing up to ${limit}:`);
    for (const row of rows.slice(0, limit)) {
      console.log(`  vault ${row.vaultAccountId.padEnd(4)} ${row.assetCode.padEnd(6)} ${formatUnits(row.quantityMinor, row.decimals).padStart(20)}  ${row.network ?? "—"}`);
    }
    const reader = new FireblocksReader(client);
    const movements = await reader.fetchTransactions(vault, since);
    console.log(`\nMovements (${movements.length}) since ${since}:`);
    for (const movement of movements.slice(0, limit)) {
      console.log(`  ${movement.occurredOn}  ${movement.direction.padEnd(3)}  ${movement.assetCode.padEnd(6)} ${formatUnits(movement.quantityMinor, 8).padStart(20)}`);
    }
  }

  console.log("\nOK: the live custodian reader returned real data.");
}

/** Minimal .env loader with multi-line PEM support. Existing process.env wins. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (/^["']/.test(value) && !/["']$/.test(value.slice(1))) {
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
