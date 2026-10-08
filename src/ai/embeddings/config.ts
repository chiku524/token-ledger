import {
  huggingFaceEmbedder,
  ollamaEmbedder,
  openAiEmbedder,
  OpenAiEmbeddingProvider,
  type EmbeddingKey,
  type EmbeddingProvider,
} from "./provider";
import type { Transport } from "../types";

/**
 * Embedding configuration for retrieval over chat history (#268). Kept separate
 * from the chat provider so an org can run a hosted chat model and a local
 * embedder (or the reverse). Unset `AI_EMBEDDING_PROVIDER` means retrieval is
 * off and the assistant behaves exactly as it does without RAG.
 */
export interface EmbeddingConfig {
  provider: EmbeddingKey;
  model: string;
  dimensions: number;
  apiKey: string | null;
  baseUrl: string | null;
}

export interface EmbeddingEnv {
  AI_EMBEDDING_PROVIDER?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_EMBEDDING_DIMENSIONS?: string;
  AI_EMBEDDING_BASE_URL?: string;
  AI_EMBEDDING_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
}

const EMBEDDING_KEYS: readonly EmbeddingKey[] = ["ollama", "openai", "huggingface", "openai-compatible"];
const NEEDS_KEY: Record<EmbeddingKey, boolean> = { ollama: false, openai: true, huggingface: true, "openai-compatible": false };
const DEFAULT_MODEL: Record<EmbeddingKey, string> = {
  ollama: "nomic-embed-text",
  openai: "text-embedding-3-small",
  huggingface: "sentence-transformers/all-MiniLM-L6-v2",
  "openai-compatible": "default",
};
const DEFAULT_DIMENSIONS: Record<EmbeddingKey, number> = { ollama: 768, openai: 1536, huggingface: 384, "openai-compatible": 768 };

export function embeddingConfig(env: EmbeddingEnv = process.env as EmbeddingEnv): EmbeddingConfig | null {
  const raw = env.AI_EMBEDDING_PROVIDER?.trim();
  if (!raw) return null;
  if (!(EMBEDDING_KEYS as readonly string[]).includes(raw)) {
    throw new Error(`AI_EMBEDDING_PROVIDER must be one of ${EMBEDDING_KEYS.join(", ")}.`);
  }
  const provider = raw as EmbeddingKey;
  const apiKey = resolveKey(provider, env);
  if (NEEDS_KEY[provider] && !apiKey) throw new Error(`An API key is required for ${provider} embeddings.`);
  return {
    provider,
    model: env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL[provider],
    dimensions: readDimensions(env.AI_EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS[provider]),
    apiKey,
    baseUrl: env.AI_EMBEDDING_BASE_URL?.trim().replace(/\/+$/, "") || null,
  };
}

export function embeddingConfigured(env: EmbeddingEnv = process.env as EmbeddingEnv): boolean {
  try {
    return embeddingConfig(env) !== null;
  } catch {
    return env.AI_EMBEDDING_PROVIDER?.trim() ? true : false;
  }
}

/** The configured embedder, or null when retrieval is off. */
export function configuredEmbedder(env: EmbeddingEnv = process.env as EmbeddingEnv, transport?: Transport): EmbeddingProvider | null {
  const config = embeddingConfig(env);
  if (!config) return null;
  const common = { baseUrl: config.baseUrl ?? undefined, model: config.model, dimensions: config.dimensions, transport };
  switch (config.provider) {
    case "ollama":
      return ollamaEmbedder({ ...common, baseUrl: config.baseUrl ?? env.OLLAMA_BASE_URL ?? undefined });
    case "openai":
      return openAiEmbedder({ ...common, apiKey: config.apiKey ?? "" });
    case "huggingface":
      return huggingFaceEmbedder({ ...common, apiKey: config.apiKey ?? "" });
    case "openai-compatible":
      return new OpenAiEmbeddingProvider({
        key: "openai-compatible",
        model: config.model,
        dimensions: config.dimensions,
        baseUrl: config.baseUrl ?? "http://127.0.0.1:8000/v1",
        apiKey: config.apiKey ?? undefined,
        transport,
      });
  }
}

function resolveKey(provider: EmbeddingKey, env: EmbeddingEnv): string | null {
  const specific = provider === "openai" ? env.OPENAI_API_KEY : provider === "huggingface" ? env.HUGGINGFACE_API_KEY : undefined;
  return (specific ?? env.AI_EMBEDDING_API_KEY)?.trim() || null;
}

function readDimensions(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8192) throw new Error("AI_EMBEDDING_DIMENSIONS must be an integer between 1 and 8192.");
  return parsed;
}
