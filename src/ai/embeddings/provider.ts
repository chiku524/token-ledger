import { ProviderError, ProviderResponseError } from "../errors";
import type { Transport } from "../types";
import { defaultTransport } from "../types";

/**
 * The embedding port. Retrieval over chat history (#268) embeds messages and
 * queries through this, separate from the chat model in `provider.ts`. Like the
 * chat providers, an implementation injects a transport so it is tested offline.
 */
export interface EmbeddingProvider {
  readonly key: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export type EmbeddingKey = "ollama" | "openai" | "huggingface" | "openai-compatible";

export interface EmbeddingOptions {
  key: EmbeddingKey;
  model: string;
  dimensions: number;
  baseUrl: string;
  apiKey?: string;
  transport?: Transport;
  /** Ollama and a local compatible endpoint need no key. */
  requireApiKey?: boolean;
}

/** Cosine similarity of two equal-length vectors. Zero when either is empty. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface OpenAiEmbeddingResponse {
  data?: { embedding?: number[]; index?: number }[];
  error?: { message?: string };
}

/**
 * One embedding adapter for every endpoint that speaks the OpenAI embeddings
 * wire format: OpenAI, Ollama's `/v1/embeddings`, Hugging Face Inference, and a
 * custom compatible endpoint.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly key: string;
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly transport: Transport;

  constructor(options: EmbeddingOptions) {
    if (options.requireApiKey && !options.apiKey) {
      throw new ProviderError(options.key, `${options.key} embeddings require an API key.`);
    }
    this.key = options.key;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.transport = options.transport ?? defaultTransport;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.transport(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    const body = await response.text();
    let json: OpenAiEmbeddingResponse;
    try {
      json = body ? (JSON.parse(body) as OpenAiEmbeddingResponse) : {};
    } catch {
      throw new ProviderResponseError(this.key, `non-JSON embeddings response (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new ProviderError(this.key, `${this.key} embeddings: ${json.error?.message ?? `HTTP ${response.status}`}`, response.status);
    }
    const vectors = (json.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding ?? []);
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
      throw new ProviderResponseError(this.key, "embeddings response did not match the input count");
    }
    return vectors;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }
}

/** A local Ollama embedder. No key; defaults to the local daemon. */
export function ollamaEmbedder(options: { baseUrl?: string; model?: string; dimensions?: number; transport?: Transport } = {}): EmbeddingProvider {
  return new OpenAiEmbeddingProvider({
    key: "ollama",
    model: options.model ?? "nomic-embed-text",
    dimensions: options.dimensions ?? 768,
    baseUrl: options.baseUrl ?? "http://127.0.0.1:11434/v1",
    transport: options.transport,
  });
}

export function openAiEmbedder(options: { apiKey: string; baseUrl?: string; model?: string; dimensions?: number; transport?: Transport }): EmbeddingProvider {
  return new OpenAiEmbeddingProvider({
    key: "openai",
    model: options.model ?? "text-embedding-3-small",
    dimensions: options.dimensions ?? 1536,
    baseUrl: options.baseUrl ?? "https://api.openai.com/v1",
    apiKey: options.apiKey,
    transport: options.transport,
    requireApiKey: true,
  });
}

export function huggingFaceEmbedder(options: { apiKey: string; baseUrl?: string; model?: string; dimensions?: number; transport?: Transport }): EmbeddingProvider {
  return new OpenAiEmbeddingProvider({
    key: "huggingface",
    model: options.model ?? "sentence-transformers/all-MiniLM-L6-v2",
    dimensions: options.dimensions ?? 384,
    baseUrl: options.baseUrl ?? "https://router.huggingface.co/v1",
    apiKey: options.apiKey,
    transport: options.transport,
    requireApiKey: true,
  });
}
