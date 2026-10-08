import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  unembedded: [] as Record<string, unknown>[],
  orgs: [] as string[],
  upserted: [] as Record<string, unknown>[],
}));

vi.mock("@/db/ai", () => ({
  listUnembeddedMessages: vi.fn(async () => db.unembedded),
  upsertMessageEmbedding: vi.fn(async (input: Record<string, unknown>) => {
    db.upserted.push(input);
  }),
}));
vi.mock("@/db/read", () => ({ listOrganizationIds: vi.fn(async () => db.orgs) }));

const embedderModule = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("./config", () => ({ configuredEmbedder: () => embedderModule.current }));

import { backfillAllEmbeddings, backfillEmbeddings } from "./backfill";
import type { EmbeddingProvider } from "./provider";

function embedder(): EmbeddingProvider {
  return {
    key: "f",
    model: "f",
    dimensions: 2,
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0])),
  } as EmbeddingProvider;
}

afterEach(() => {
  db.unembedded = [];
  db.orgs = [];
  db.upserted = [];
  embedderModule.current = null;
  vi.clearAllMocks();
});

describe("backfillEmbeddings", () => {
  it("embeds pending messages, skipping any too short", async () => {
    db.unembedded = [
      { id: "m1", threadId: "t1", content: "a real message" },
      { id: "m2", threadId: "t1", content: "x" },
    ];
    const result = await backfillEmbeddings({ organizationId: "org", embedder: embedder() });
    expect(result).toMatchObject({ embedded: 1, skipped: 1, failed: 0 });
    expect(db.upserted.map((row) => row.messageId)).toEqual(["m1"]);
  });

  it("counts a provider failure instead of throwing", async () => {
    db.unembedded = [{ id: "m1", threadId: "t1", content: "a real message" }];
    const failing = { key: "f", model: "f", dimensions: 2, embed: vi.fn(async () => { throw new Error("down"); }) } as EmbeddingProvider;
    const result = await backfillEmbeddings({ organizationId: "org", embedder: failing });
    expect(result.failed).toBe(1);
    expect(result.embedded).toBe(0);
  });
});

describe("backfillAllEmbeddings", () => {
  it("is a no-op (null) when retrieval is off", async () => {
    embedderModule.current = null;
    expect(await backfillAllEmbeddings()).toBeNull();
  });

  it("sweeps every organization", async () => {
    embedderModule.current = embedder();
    db.orgs = ["org_a", "org_b"];
    db.unembedded = [{ id: "m1", threadId: "t1", content: "hello world" }];
    const result = await backfillAllEmbeddings();
    expect(result?.embedded).toBe(2); // one per org, since the mock returns the same rows
  });
});
