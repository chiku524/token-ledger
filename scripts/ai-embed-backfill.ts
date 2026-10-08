/**
 * Embed existing assistant messages so retrieval can recall them (#268).
 *
 * Idempotent: messages that already have an embedding are skipped. Needs a
 * database and a configured embedding provider (`AI_EMBEDDING_PROVIDER`).
 *
 * Usage:
 *   pnpm ai:embed-backfill            # every organization
 *   pnpm ai:embed-backfill <ORG_ID>   # one organization
 */
import { existsSync, readFileSync } from "node:fs";
import { configuredEmbedder } from "@/ai/embeddings/config";
import { backfillEmbeddings } from "@/ai/embeddings/backfill";
import { listOrganizationIds } from "@/db/read";
import { readDatabaseUrl } from "@/env";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  if (!readDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Embeddings need a database.");
    process.exitCode = 1;
    return;
  }
  const embedder = configuredEmbedder();
  if (!embedder) {
    console.error("AI_EMBEDDING_PROVIDER is not set. Retrieval is off, so there is nothing to backfill.");
    process.exitCode = 1;
    return;
  }

  const requested = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const organizationIds = requested ? [requested] : await listOrganizationIds();
  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  for (const organizationId of organizationIds) {
    const result = await backfillEmbeddings({ organizationId, embedder });
    embedded += result.embedded;
    skipped += result.skipped;
    failed += result.failed;
  }
  console.log(`Embedded ${embedded}, skipped ${skipped}, failed ${failed} across ${organizationIds.length} organization(s).`);
  if (failed > 0) process.exitCode = 1;
  else console.log("OK: message history embedded.");
}

/** Minimal .env loader, matching other scripts. Existing process.env wins. */
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
