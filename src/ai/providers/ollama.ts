import type { LlmProvider } from "../provider";
import type { Transport } from "../types";
import { OpenAiCompatibleProvider } from "./openai-compatible";

const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

export interface OllamaOptions {
  /** Ollama's OpenAI-compatible endpoint. Defaults to the local daemon. */
  baseUrl?: string;
  defaultModel?: string;
  transport?: Transport;
}

/**
 * A local Ollama daemon, reached through its OpenAI-compatible endpoint. No API
 * key. Because the endpoint is usually local, a non-https base URL is allowed
 * here (unlike the hosted providers).
 */
export function ollamaProvider(options: OllamaOptions = {}): LlmProvider {
  return new OpenAiCompatibleProvider({
    key: "ollama",
    descriptor: {
      key: "ollama",
      name: "Ollama",
      system: "Ollama (local)",
      implemented: true,
      summary: "A local open-weight model through Ollama's OpenAI-compatible endpoint. No key.",
    },
    baseUrl: options.baseUrl ?? OLLAMA_BASE_URL,
    defaultModel: options.defaultModel ?? "llama3.1",
    transport: options.transport,
  });
}
