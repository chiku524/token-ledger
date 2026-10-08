import { listUnembeddedMessages, upsertMessageEmbedding } from "@/db/ai";
import { listOrganizationIds } from "@/db/read";
import { configuredEmbedder } from "./config";
import type { EmbeddingProvider } from "./provider";

/**
 * Embed messages that do not yet have a vector, for retrieval over existing chat
 * history (#268). Idempotent: a message that already has an embedding is skipped,
 * so a re-run is safe. A provider failure is counted and the run continues — a
 * missing embedding degrades retrieval, it does not break the assistant.
 */
export interface BackfillResult {
  embedded: number;
  skipped: number;
  failed: number;
}

export async function backfillEmbeddings(input: {
  organizationId: string;
  embedder: EmbeddingProvider;
  /** How many messages to process in this pass. */
  limit?: number;
  /** Only embed messages with non-empty content. */
  minLength?: number;
}): Promise<BackfillResult> {
  const minLength = input.minLength ?? 3;
  const pending = await listUnembeddedMessages(input.organizationId, input.limit ?? 200);
  const usable = pending.filter((message) => message.content.trim().length >= minLength);

  const result: BackfillResult = { embedded: 0, skipped: pending.length - usable.length, failed: 0 };
  if (usable.length === 0) return result;

  try {
    const vectors = await input.embedder.embed(usable.map((message) => message.content));
    for (let index = 0; index < usable.length; index += 1) {
      const vector = vectors[index];
      if (!vector?.length) {
        result.failed += 1;
        continue;
      }
      await upsertMessageEmbedding({
        organizationId: input.organizationId,
        threadId: usable[index].threadId ?? "",
        messageId: usable[index].id,
        model: input.embedder.model,
        vector,
      });
      result.embedded += 1;
    }
  } catch {
    result.failed += usable.length;
  }
  return result;
}

/**
 * The scheduled safety net: embed any message that missed its insert-time embed
 * (a provider outage, a timeout) across every organization. Bounded per run and
 * idempotent, so it is safe on a cron. A no-op when no embedder is configured.
 * Returns null when the assistant's retrieval is off.
 */
export async function backfillAllEmbeddings(options: { limit?: number } = {}): Promise<BackfillResult | null> {
  const embedder = configuredEmbedder();
  if (!embedder) return null;
  const total: BackfillResult = { embedded: 0, skipped: 0, failed: 0 };
  for (const organizationId of await listOrganizationIds()) {
    const result = await backfillEmbeddings({ organizationId, embedder, limit: options.limit ?? 100 });
    total.embedded += result.embedded;
    total.failed += result.failed;
    total.skipped += result.skipped;
  }
  return total;
}
