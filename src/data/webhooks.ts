/**
 * Signed source events. A source that supports push (a custodian, an exchange,
 * or a self-hosted watcher) posts a JSON event signed with a shared secret. The
 * receiver verifies the signature against the raw body, rejects a stale
 * timestamp, and normalizes the event into a source transaction.
 *
 * The scheme is Stripe-like so it is familiar and testable:
 *   header `X-Token-Ledger-Signature: t=<unix seconds>,v1=<hex hmac-sha256>`
 *   signed payload: `${t}.${rawBody}`
 * A delivery id in `X-Token-Ledger-Delivery` is recorded so the same event
 * cannot be ingested twice.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { toMinor } from "@/ledger";

export const SIGNATURE_HEADER = "x-token-ledger-signature";
export const DELIVERY_HEADER = "x-token-ledger-delivery";
/** A signature older than this is rejected, which bounds replay of a captured request. */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export class WebhookError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WebhookError";
    this.status = status;
  }
}

export interface WebhookEvent {
  sourceId: string;
  externalId: string;
  occurredOn: string;
  assetCode: string;
  direction: "in" | "out";
  quantity: string;
  /** The validated quantity in the asset's minor units. */
  quantityMinor: bigint;
  description: string;
}

/** Sign a raw body. Exposed for the CLI and tests; the server only verifies. */
export function signWebhook(rawBody: string, secret: string, timestampSeconds: number): string {
  const mac = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

/**
 * Derive a per-source signing secret from the app secret, so a leaked source
 * secret does not let an attacker sign for any other source.
 */
export function deriveSourceSecret(masterSecret: string, sourceId: string): string {
  return createHmac("sha256", masterSecret).update(`source:${sourceId}`).digest("hex");
}

interface ParsedSignature {
  timestampSeconds: number;
  digest: string;
}

function parseSignature(header: string): ParsedSignature {
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=");
    if (key && value) parts.set(key.trim(), value.trim());
  }
  const timestamp = parts.get("t");
  const digest = parts.get("v1");
  if (!timestamp || !digest || !/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(digest)) {
    throw new WebhookError("Signature header is malformed.", 401);
  }
  return { timestampSeconds: Number(timestamp), digest: digest.toLowerCase() };
}

/** Verify a signature over the raw body. Throws WebhookError on any mismatch. */
export function verifyWebhookSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string;
  now?: number;
  maxAgeMs?: number;
}): void {
  if (!input.header) throw new WebhookError("Missing signature header.", 401);
  const { timestampSeconds, digest } = parseSignature(input.header);
  const now = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? WEBHOOK_MAX_AGE_MS;
  if (Math.abs(now - timestampSeconds * 1000) > maxAge) {
    throw new WebhookError("Signature timestamp is outside the allowed window.", 401);
  }
  const expected = createHmac("sha256", input.secret).update(`${timestampSeconds}.${input.rawBody}`).digest();
  const provided = Buffer.from(digest, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new WebhookError("Signature does not match.", 401);
  }
}

/**
 * Validate an event payload and convert its quantity to minor units with the
 * asset's decimals. Throws WebhookError with a caller-safe message.
 */
export function normalizeWebhookEvent(input: unknown, assets: readonly { code: string; decimals: number }[]): WebhookEvent {
  if (typeof input !== "object" || input === null) throw new WebhookError("Body must be a JSON object.");
  const raw = input as Record<string, unknown>;
  const text = (key: string): string => {
    const value = raw[key];
    if (typeof value !== "string" || value.trim() === "") throw new WebhookError(`Event is missing ${key}.`);
    return value.trim();
  };
  const sourceId = text("sourceId");
  const externalId = text("externalId");
  const occurredOn = text("occurredOn");
  const assetCode = text("assetCode");
  const direction = text("direction");
  const quantity = text("quantity");
  const description = typeof raw.description === "string" && raw.description.trim() !== "" ? raw.description.trim() : "Source event";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(Date.parse(occurredOn))) {
    throw new WebhookError("Event has an invalid occurredOn.");
  }
  if (direction !== "in" && direction !== "out") throw new WebhookError("Event direction must be in or out.");
  const scale = assets.find((asset) => asset.code === assetCode)?.decimals;
  if (scale === undefined) throw new WebhookError(`Unknown asset ${assetCode}.`);
  let quantityMinor: bigint;
  try {
    quantityMinor = toMinor(quantity, scale);
  } catch (error) {
    throw new WebhookError(error instanceof Error ? error.message : "Invalid quantity.");
  }

  return { sourceId, externalId, occurredOn, assetCode, direction, quantity, quantityMinor, description };
}

/**
 * A stable hash of the normalized event, used to reject an exact duplicate
 * payload under a different delivery id or external id.
 */
export function eventFingerprint(event: WebhookEvent): string {
  const canonical = { ...event, quantityMinor: event.quantityMinor.toString() };
  return createHmac("sha256", "token-ledger.webhook-fingerprint.v1").update(JSON.stringify(canonical)).digest("hex");
}
