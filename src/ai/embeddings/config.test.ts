import { describe, expect, it } from "vitest";
import { configuredEmbedder, embeddingConfig, embeddingConfigured } from "./config";

describe("embeddingConfig", () => {
  it("is off when no provider is set", () => {
    expect(embeddingConfig({})).toBeNull();
    expect(embeddingConfigured({})).toBe(false);
  });

  it("rejects an unknown provider", () => {
    expect(() => embeddingConfig({ AI_EMBEDDING_PROVIDER: "nope" })).toThrow(/AI_EMBEDDING_PROVIDER/);
  });

  it("requires a key for a hosted embedder but not for Ollama", () => {
    expect(() => embeddingConfig({ AI_EMBEDDING_PROVIDER: "openai" })).toThrow(/API key/);
    expect(embeddingConfig({ AI_EMBEDDING_PROVIDER: "ollama" })?.provider).toBe("ollama");
  });

  it("uses per-provider defaults and honours overrides", () => {
    expect(embeddingConfig({ AI_EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "k" })).toMatchObject({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });
    expect(embeddingConfig({ AI_EMBEDDING_PROVIDER: "ollama", AI_EMBEDDING_MODEL: "mxbai", AI_EMBEDDING_DIMENSIONS: "512" })).toMatchObject({
      model: "mxbai",
      dimensions: 512,
    });
  });

  it("validates dimensions", () => {
    expect(() => embeddingConfig({ AI_EMBEDDING_PROVIDER: "ollama", AI_EMBEDDING_DIMENSIONS: "0" })).toThrow(/AI_EMBEDDING_DIMENSIONS/);
  });

  it("builds the configured embedder or null", () => {
    expect(configuredEmbedder({})).toBeNull();
    expect(configuredEmbedder({ AI_EMBEDDING_PROVIDER: "ollama" })?.key).toBe("ollama");
  });
});
