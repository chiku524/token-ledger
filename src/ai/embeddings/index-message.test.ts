import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upserted: [] as Record<string, unknown>[] }));
vi.mock("@/db/ai", () => ({
  upsertMessageEmbedding: vi.fn(async (input: Record<string, unknown>) => {
    db.upserted.push(input);
  }),
}));

import { indexMessageEmbedding, INDEX_TIMEOUT_MS } from "./index-message";
import type { EmbeddingProvider } from "./provider";

function embedder(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    key: "fake",
    model: "fake-model",
    dimensions: 2,
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0])),
    ...overrides,
  } as EmbeddingProvider;
}

const input = { organizationId: "org", threadId: "thr", messageId: "msg_1", content: "open matching" };

afterEach(() => {
  db.upserted = [];
  vi.clearAllMocks();
});

describe("indexMessageEmbedding", () => {
  it("embeds and stores a message", async () => {
    const ok = await indexMessageEmbedding(input, embedder());
    expect(ok).toBe(true);
    expect(db.upserted[0]).toMatchObject({ messageId: "msg_1", threadId: "thr", model: "fake-model", vector: [1, 0] });
  });

  it("is a no-op when no embedder is configured", async () => {
    expect(await indexMessageEmbedding(input, null)).toBe(false);
    expect(db.upserted).toHaveLength(0);
  });

  it("skips content that is too short to be worth embedding", async () => {
    expect(await indexMessageEmbedding({ ...input, content: "a" }, embedder())).toBe(false);
    expect(db.upserted).toHaveLength(0);
  });

  it("returns false, not a throw, when the provider fails", async () => {
    const failing = embedder({ embed: vi.fn(async () => { throw new Error("provider down"); }) });
    expect(await indexMessageEmbedding(input, failing)).toBe(false);
    expect(db.upserted).toHaveLength(0);
  });

  it("abandons a slow embed at the timeout instead of blocking the turn", async () => {
    const slow = embedder({ embed: vi.fn(() => new Promise<number[][]>(() => {})) });
    const started = Date.now();
    const ok = await indexMessageEmbedding(input, slow, 50);
    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(INDEX_TIMEOUT_MS);
  });

  it("returns false when the provider returns an empty vector", async () => {
    const empty = embedder({ embed: vi.fn(async (texts: string[]) => texts.map((): number[] => [])) });
    expect(await indexMessageEmbedding(input, empty)).toBe(false);
    expect(db.upserted).toHaveLength(0);
  });
});
