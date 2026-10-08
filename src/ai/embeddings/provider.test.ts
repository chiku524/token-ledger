import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderResponseError } from "../errors";
import type { Transport } from "../types";
import { cosineSimilarity, OpenAiEmbeddingProvider, ollamaEmbedder } from "./provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("cosineSimilarity", () => {
  it("is 1 for identical, 0 for orthogonal, and 0 for a dimension mismatch", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("OpenAiEmbeddingProvider", () => {
  it("embeds in input order and returns one vector per text", async () => {
    const transport: Transport = async () =>
      jsonResponse({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] });
    const provider = ollamaEmbedder({ transport });
    const vectors = await provider.embed(["a", "b"]);
    expect(vectors).toEqual([[1, 0], [0, 1]]);
  });

  it("returns an empty array for no input without calling the transport", async () => {
    const transport = vi.fn<Transport>();
    const provider = ollamaEmbedder({ transport });
    expect(await provider.embed([])).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("surfaces a non-2xx as a ProviderError", async () => {
    const transport: Transport = async () => jsonResponse({ error: { message: "bad key" } }, 401);
    const provider = ollamaEmbedder({ transport });
    await expect(provider.embed(["a"])).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a mismatched count with a typed error", async () => {
    const transport: Transport = async () => jsonResponse({ data: [{ index: 0, embedding: [1] }] });
    const provider = ollamaEmbedder({ transport });
    await expect(provider.embed(["a", "b"])).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it("does not touch the network with a faked transport", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    try {
      const provider = new OpenAiEmbeddingProvider({
        key: "openai-compatible",
        model: "m",
        dimensions: 2,
        baseUrl: "http://127.0.0.1:8000/v1",
        transport: async () => jsonResponse({ data: [{ embedding: [1, 2] }] }),
      });
      await provider.embed(["a"]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
