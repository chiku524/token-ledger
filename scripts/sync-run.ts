/**
 * Manual scheduled-sync driver.
 *
 * Runs the same due-connection pass the scheduler makes, records every run in
 * sync history, and prints a per-connection line. Read-only: no journal is
 * posted. Needs DATABASE_URL; without it there is nothing to store a run in.
 *
 * Usage:
 *   pnpm sync:run                 # every organization with a connection
 *   pnpm sync:run <ORG_ID>        # one organization
 *   pnpm sync:run <ORG_ID> --all  # one organization, ignore interval/backoff
 */
import { existsSync, readFileSync } from "node:fs";
import { readDatabaseUrl } from "@/env";
import { runAllConnectionSyncs, runDueSyncsForAllOrganizations } from "@/data/run-sync";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  if (!readDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Sync history needs a database.");
    process.exitCode = 1;
    return;
  }

  const organizationId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const everyConnection = process.argv.includes("--all");

  if (!organizationId) {
    const summary = await runDueSyncsForAllOrganizations();
    console.log(
      `Organizations ${summary.organizations} · connections run ${summary.connections} · failures ${summary.failures}`,
    );
    console.log("OK: the scheduled pass finished.");
    return;
  }

  const outcomes = await runAllConnectionSyncs(organizationId, {
    actor: "command line",
    trigger: "cli",
    onlyDue: !everyConnection,
  });
  if (outcomes.length === 0) {
    console.log("No connection was due. Use --all to run every connection.");
  }
  for (const outcome of outcomes) {
    console.log(
      `${outcome.status.padEnd(8)} ${outcome.connectionId}  balances ${outcome.balances}  movements ${outcome.movements}  ${outcome.message}`,
    );
  }
  console.log("\nOK: the sync pass finished.");
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
