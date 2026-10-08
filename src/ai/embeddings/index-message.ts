import { upsertMessageEmbedding } from "@/db/ai";
import type { EmbeddingProvider } from "./provider";
import { configuredEmbedder } from "./config";

/**
 * Embed one message as it is written, so retrieval can recall it immediately —
 * no backfill lag (issue #268 / AI-10). This is called right after every
 * `appendMessage`, awaited: on Cloudflare a detached promise may be cancelled
 * when the response ends, so awaiting is what makes the write reliable.
 *
 * It never throws and never blocks the turn: when no embedder is configured, or
 * the content is too short, or the provider fails, it returns false and the
 * message simply stays unembedded (retrieval degrades, nothing breaks). The
 * backfill (`pnpm ai:embed-backfill`) remains the way to catch up a failure.
 */
export interface IndexMessageInput {
  organizationId: string;
  threadId: string;
  messageId: string;
  content: string;
}

/** A slow provider must not hold a turn open; past this the embed is abandoned. */
export const INDEX_TIMEOUT_MS = 10_000;

export async function indexMessageEmbedding(
  input: IndexMessageInput,
  embedder: EmbeddingProvider | null = configuredEmbedder(),
  timeoutMs = INDEX_TIMEOUT_MS,
): Promise<boolean> {
  const text = input.content.trim();
  if (!embedder || text.length < 3) return false;
  try {
    const vector = await withTimeout(async () => {
      const [embedded] = await embedder.embed([text]);
      return embedded;
    }, timeoutMs);
    if (!vector?.length) return false;
    await upsertMessageEmbedding({
      organizationId: input.organizationId,
      threadId: input.threadId,
      messageId: input.messageId,
      model: embedder.model,
      vector,
    });
    return true;
  } catch {
    // A retrieval miss is acceptable; a broken turn is not.
    return false;
  }
}

async function withTimeout<T>(work: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("embedding timed out")), ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
