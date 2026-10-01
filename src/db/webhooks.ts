/**
 * Persistence for signed source events. Ingestion is idempotent: the unique
 * `(source_id, external_id)` key on `webhook_events` makes a redelivery a no-op,
 * and the same event also cannot create a second source transaction.
 */
import { and, eq } from "drizzle-orm";
import type { ParsedSourceTransaction } from "@/data/source-csv";
import type { WebhookEvent } from "@/data/webhooks";
import { getDb } from "./client";
import { assets, auditEvents, matchJobs, sourceTransactions, sources, webhookEvents } from "./schema";

export interface WebhookSourceContext {
  sourceId: string;
  organizationId: string;
  entityId: string;
  connectionId: string | null;
  assets: Array<{ id: string; code: string; decimals: number }>;
}

/** The source an event names, with the assets needed to resolve its payload. */
export async function findWebhookSource(sourceId: string): Promise<WebhookSourceContext | null> {
  const db = getDb();
  const source = (await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1))[0];
  if (!source) return null;
  const assetRows = await db
    .select({ id: assets.id, code: assets.code, decimals: assets.decimals })
    .from(assets)
    .where(eq(assets.organizationId, source.organizationId));
  return {
    sourceId: source.id,
    organizationId: source.organizationId,
    entityId: source.entityId,
    connectionId: source.connectionId,
    assets: assetRows,
  };
}

export interface RecordWebhookInput {
  context: WebhookSourceContext;
  event: WebhookEvent;
  row: ParsedSourceTransaction;
  deliveryId: string | null;
  fingerprint: string;
  rawBody: string;
}

/** Ingest one event: keep the audit row, write the transaction, and queue matching. */
export async function recordWebhookIngest(input: RecordWebhookInput): Promise<"accepted" | "duplicate"> {
  const { context, event, row } = input;
  const asset = context.assets.find((item) => item.code === event.assetCode);
  if (!asset) throw new Error(`Unknown asset ${event.assetCode}.`);
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(webhookEvents)
      .values({
        id: `evt_${crypto.randomUUID()}`,
        organizationId: context.organizationId,
        sourceId: context.sourceId,
        deliveryId: input.deliveryId,
        externalId: event.externalId,
        fingerprint: input.fingerprint,
        rawBody: input.rawBody,
      })
      .onConflictDoNothing({ target: [webhookEvents.sourceId, webhookEvents.externalId] })
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return "duplicate";

    await tx
      .insert(sourceTransactions)
      .values({
        id: `stx_${crypto.randomUUID()}`,
        organizationId: context.organizationId,
        entityId: context.entityId,
        sourceId: context.sourceId,
        externalId: row.externalId,
        occurredOn: row.occurredOn,
        assetId: asset.id,
        direction: row.direction,
        quantityMinor: row.quantityMinor,
        description: row.description,
      })
      .onConflictDoNothing({ target: [sourceTransactions.sourceId, sourceTransactions.externalId] });

    await tx.insert(matchJobs).values({
      id: `job_${crypto.randomUUID()}`,
      organizationId: context.organizationId,
      entityId: context.entityId,
      sourceId: context.sourceId,
      status: "queued",
    });

    await tx.insert(auditEvents).values({
      id: `audit_${crypto.randomUUID()}`,
      organizationId: context.organizationId,
      occurredAt: new Date(),
      actor: "source webhook",
      action: "source_transactions.received",
      subjectType: "source",
      subjectId: context.sourceId,
      detail: `${event.direction === "in" ? "Received" : "Sent"} ${event.quantity} ${event.assetCode} (${event.externalId}).`,
    });
    return "accepted";
  });
}

/** Count queued match jobs for an organization, for the operations view. */
export async function queuedMatchJobCount(organizationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: matchJobs.id })
    .from(matchJobs)
    .where(and(eq(matchJobs.organizationId, organizationId), eq(matchJobs.status, "queued")));
  return rows.length;
}
