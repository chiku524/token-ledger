/**
 * Signed source-event receiver. A source (a custodian, an exchange, or a
 * self-hosted watcher) posts a JSON event; the signature header authorises it,
 * so no session is needed. The event is normalized into a source transaction and
 * a matching job is queued. A redelivery is acknowledged as a duplicate.
 *
 * Headers:
 *   X-Token-Ledger-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
 *   X-Token-Ledger-Delivery:  <opaque delivery id>   (optional)
 *
 * The raw body is signed as `${t}.${body}` with the per-source secret derived
 * from WEBHOOK_SIGNING_SECRET. See docs/adr-scheduled-ingestion.md.
 */
import { webhookSigningConfigured } from "@/env";
import { acceptWebhookEvent } from "@/data/webhook-ingest";
import { DELIVERY_HEADER, SIGNATURE_HEADER } from "@/data/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guard the parse: a source event is small, and an oversized body is rejected. */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!webhookSigningConfigured()) {
    return Response.json({ status: "rejected", message: "Webhooks are not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json({ status: "rejected", message: "Body is too large." }, { status: 413 });
  }

  const result = await acceptWebhookEvent({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
    deliveryId: request.headers.get(DELIVERY_HEADER),
  });
  return Response.json(result.body, { status: result.status });
}
