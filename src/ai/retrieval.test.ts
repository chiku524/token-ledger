import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A fake store: retrieval reads candidates and unembedded messages from
 * `@/db/ai`. We replace just those two functions so the ranking, scoping and
 * formatting under test are the real ones.
 */
const db = vi.hoisted(() => ({
  candidates: [] as unknown[],
  unembedded: [] as unknown[],
}));

vi.mock("@/db/ai", () => ({
  listEmbeddingCandidates: async () => db.candidates,
  listUnembeddedMessages: async () => db.unembedded,
}));

import type { EmbeddingProvider } from "./embeddings/provider";
import { formatMemories, rankBySimilarity, retrieveRelevant } from "./retrieval";

/** An embedder whose vectors depend only on whether the text is known. */
function fakeEmbedder(vectors: Record<string, number[]>): EmbeddingProvider {
  return {
    key: "fake",
    model: "fake",
    dimensions: 2,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => vectors[text] ?? [0, 0]);
    },
  };
}

afterEach(() => {
  db.candidates = [];
  db.unembedded = [];
  vi.clearAllMocks();
});

describe("rankBySimilarity", () => {
  const candidates = [
    { messageId: "m1", content: "matching question", vector: [1, 0] },
    { messageId: "m2", content: "reporting question", vector: [0, 1] },
    { messageId: "m3", content: "another", vector: [0.9, 0.1] },
  ];

  it("orders by cosine and caps at k", () => {
    const ranked = rankBySimilarity([1, 0], candidates, { k: 2, floor: 0 });
    expect(ranked.map((entry) => entry.candidate.messageId)).toEqual(["m1", "m3"]);
  });

  it("drops anything below the floor", () => {
    const ranked = rankBySimilarity([1, 0], candidates, { k: 5, floor: 0.5 });
    expect(ranked.map((entry) => entry.candidate.messageId)).toEqual(["m1", "m3"]);
  });

  it("de-duplicates identical content", () => {
    const duped = [
      { messageId: "m1", content: "same", vector: [1, 0] },
      { messageId: "m2", content: "SAME", vector: [0.99, 0.01] },
    ];
    const ranked = rankBySimilarity([1, 0], duped, { k: 5, floor: 0 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].candidate.messageId).toBe("m1");
  });
});

describe("retrieveRelevant", () => {
  it("returns an empty list when there is nothing to retrieve", async () => {
    const result = await retrieveRelevant({ organizationId: "org", query: "anything", embedder: fakeEmbedder({}) });
    expect(result).toEqual([]);
  });

  it("returns an empty list for a blank query without embedding", async () => {
    const embedder = { key: "f", model: "f", dimensions: 2, embed: vi.fn(async () => [[1, 0]]) } as EmbeddingProvider;
    db.candidates = [{ messageId: "m1", content: "x", vector: [1, 0], threadId: "t", threadTitle: "T", role: "user", model: "f" }];
    expect(await retrieveRelevant({ organizationId: "org", query: "  ", embedder })).toEqual([]);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("ranks candidates and cites the thread", async () => {
    db.candidates = [
      { messageId: "m1", content: "matching discussion", vector: [1, 0], threadId: "t1", threadTitle: "Matching", role: "user", model: "f" },
      { messageId: "m2", content: "reports discussion", vector: [0, 1], threadId: "t2", threadTitle: "Reports", role: "assistant", model: "f" },
    ];
    const embedder = fakeEmbedder({ "how does matching work": [1, 0] });
    const result = await retrieveRelevant({ organizationId: "org", query: "how does matching work", embedder, k: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ messageId: "m1", threadTitle: "Matching", role: "user" });
  });

  it("honours the allow predicate so scope is never crossed", async () => {
    db.candidates = [
      { messageId: "m1", content: "in scope", vector: [1, 0], threadId: "t1", threadTitle: "In", role: "user", model: "f" },
      { messageId: "m2", content: "out of scope secret", vector: [1, 0], threadId: "t2", threadTitle: "Out", role: "user", model: "f" },
    ];
    const embedder = fakeEmbedder({ q: [1, 0] });
    const result = await retrieveRelevant({
      organizationId: "org",
      query: "q",
      embedder,
      allow: (candidate) => candidate.threadId === "t1",
    });
    expect(result.map((memory) => memory.messageId)).toEqual(["m1"]);
  });

  it("excludes the current turn's own message by id", async () => {
    db.candidates = [
      { messageId: "self", content: "what did we decide", vector: [1, 0], threadId: "t1", threadTitle: "T", role: "user", model: "f" },
      { messageId: "other", content: "we decided to close March", vector: [0.9, 0.1], threadId: "t1", threadTitle: "T", role: "assistant", model: "f" },
    ];
    const embedder = fakeEmbedder({ "what did we decide": [1, 0] });
    const result = await retrieveRelevant({
      organizationId: "org",
      query: "what did we decide",
      embedder,
      allow: (candidate) => candidate.messageId !== "self",
    });
    expect(result.map((memory) => memory.messageId)).toEqual(["other"]);
  });

  it("caps the injected content length", async () => {
    db.candidates = [{ messageId: "m1", content: "x".repeat(100), vector: [1, 0], threadId: "t1", threadTitle: "T", role: "user", model: "f" }];
    const embedder = fakeEmbedder({ q: [1, 0] });
    const result = await retrieveRelevant({ organizationId: "org", query: "q", embedder, maxCharactersPerMemory: 10 });
    expect(result[0].content).toHaveLength(11); // 10 + ellipsis
  });
});

describe("formatMemories", () => {
  it("is empty for no memories", () => {
    expect(formatMemories([])).toBe("");
  });

  it("numbers and attributes each memory", () => {
    const block = formatMemories([
      { threadId: "t1", threadTitle: "Matching", messageId: "m1", role: "user", content: "match USDC", score: 0.9 },
    ]);
    expect(block).toContain("[1]");
    expect(block).toContain("Matching");
    expect(block).toContain("match USDC");
  });
});
