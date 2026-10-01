/**
 * Send a signed source event to the webhook receiver, for local verification.
 *
 * Builds a single event, signs the raw body with the per-source secret derived
 * from WEBHOOK_SIGNING_SECRET, and POSTs it. The receiver verifies the signature,
 * ingests the event as a source transaction, and queues matching.
 *
 * Usage:
 *   pnpm webhook:send <SOURCE_ID> <ASSET_CODE> <in|out> <QUANTITY> [URL]
 *
 * Env:
 *   WEBHOOK_SIGNING_SECRET  required; the receiver and this script share it
 *   WEBHOOK_URL             default http://localhost:3000/api/webhooks/source
 */
import { existsSync, readFileSync } from "node:fs";
import { deriveSourceSecret, DELIVERY_HEADER, eventFingerprint, normalizeWebhookEvent, signWebhook, SIGNATURE_HEADER } from "@/data/webhooks";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const [sourceId, assetCode, direction, quantity] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const url = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhooks/source";
  if (!sourceId || !assetCode || (direction !== "in" && direction !== "out") || !quantity) {
    console.error("Usage: pnpm webhook:send <SOURCE_ID> <ASSET_CODE> <in|out> <QUANTITY> [URL]");
    process.exitCode = 1;
    return;
  }
  const secret = process.env.WEBHOOK_SIGNING_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    console.error("Set WEBHOOK_SIGNING_SECRET (32+ characters) in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }

  const event = {
    sourceId,
    externalId: `manual-${Date.now()}`,
    occurredOn: new Date().toISOString().slice(0, 10),
    assetCode,
    direction,
    quantity,
    description: "Signed test event",
  };
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const header = signWebhook(rawBody, deriveSourceSecret(secret, sourceId), timestamp);
  // Validate locally so a bad quantity fails here, not at the receiver.
  console.log(`Fingerprint: ${eventFingerprint(normalizeWebhookEvent(event, [{ code: assetCode, decimals: 8 }]))}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: header,
      [DELIVERY_HEADER]: `cli-${timestamp}`,
    },
    body: rawBody,
  });
  console.log(`POST ${url} -> ${response.status}`);
  console.log(await response.text());
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
