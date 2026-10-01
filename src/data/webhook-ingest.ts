/**
 * Accept a signed source event. This is the server-side entry point the route
 * calls: it verifies the signature over the raw body, resolves the source,
 * normalizes the payload, and ingests it idempotently. No session is required,
 * which is what lets a source push without a browser; the signature is the
 * authorisation.
 */
import { readWebhookSigningSecret } from "@/env";
import { findWebhookSource, recordWebhookIngest } from "@/db/webhooks";
import {
  deriveSourceSecret,
  eventFingerprint,
  normalizeWebhookEvent,
  verifyWebhookSignature,
  WebhookError,
} from "./webhooks";

export interface WebhookRequest {
  rawBody: string;
  signature: string | null;
  deliveryId: string | null;
}

export interface WebhookResult {
  status: number;
  body: { status: string; sourceId?: string; externalId?: string; message?: string };
}

export async function acceptWebhookEvent(request: WebhookRequest): Promise<WebhookResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return { status: 400, body: { status: "rejected", message: "Body is not JSON." } };
  }

  const sourceId =
    typeof payload === "object" && payload !== null && typeof (payload as { sourceId?: unknown }).sourceId === "string"
      ? (payload as { sourceId: string }).sourceId
      : null;
  if (!sourceId) return { status: 400, body: { status: "rejected", message: "Event is missing sourceId." } };

  const source = await findWebhookSource(sourceId);
  if (!source) return { status: 404, body: { status: "rejected", message: "Unknown source." } };

  try {
    verifyWebhookSignature({
      rawBody: request.rawBody,
      header: request.signature,
      secret: deriveSourceSecret(readWebhookSigningSecret(), sourceId),
    });
  } catch (error) {
    if (error instanceof WebhookError) return { status: error.status, body: { status: "rejected", message: error.message } };
    return { status: 401, body: { status: "rejected", message: "Signature could not be verified." } };
  }

  let event;
  try {
    event = normalizeWebhookEvent(payload, source.assets);
  } catch (error) {
    if (error instanceof WebhookError) return { status: error.status, body: { status: "rejected", message: error.message } };
    throw error;
  }
  if (event.sourceId !== source.sourceId) {
    return { status: 400, body: { status: "rejected", message: "Event source does not match the signature." } };
  }

  const outcome = await recordWebhookIngest({
    context: source,
    event,
    row: {
      externalId: event.externalId,
      occurredOn: event.occurredOn,
      assetCode: event.assetCode,
      direction: event.direction,
      quantityMinor: event.quantityMinor,
      description: event.description,
    },
    deliveryId: request.deliveryId,
    fingerprint: eventFingerprint(event),
    rawBody: request.rawBody,
  });

  if (outcome === "duplicate") {
    return { status: 200, body: { status: "duplicate", sourceId, externalId: event.externalId } };
  }
  return { status: 202, body: { status: "accepted", sourceId, externalId: event.externalId } };
}
