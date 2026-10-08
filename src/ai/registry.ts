import { aiConfig, type AiConfig, type AiEnv } from "./config";
import type { LlmProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";
import { huggingFaceProvider } from "./providers/huggingface";
import { ollamaProvider } from "./providers/ollama";
import { openAiProvider, openRouterProvider } from "./providers/openai";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";
import type { LlmDescriptor, ProviderKey, Transport } from "./types";

/** Every provider key the assistant understands, in display order. */
export const PROVIDER_KEYS = ["ollama", "anthropic", "openai", "huggingface", "openrouter", "openai-compatible"] as const;

export const PROVIDER_DESCRIPTORS: LlmDescriptor[] = [
  {
    key: "ollama",
    name: "Ollama",
    system: "Ollama (local)",
    implemented: true,
    summary: "A local open-weight model through Ollama's OpenAI-compatible endpoint. No key.",
  },
  {
    key: "anthropic",
    name: "Anthropic Claude",
    system: "Anthropic",
    implemented: true,
    summary: "Claude models through the Anthropic Messages API. Tool use supported.",
  },
  {
    key: "openai",
    name: "OpenAI ChatGPT",
    system: "OpenAI",
    implemented: true,
    summary: "GPT models through the OpenAI Chat Completions API. Tool calling supported.",
  },
  {
    key: "huggingface",
    name: "Hugging Face",
    system: "Hugging Face",
    implemented: true,
    summary: "Hosted open models through Hugging Face Inference Providers (OpenAI-compatible).",
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    system: "OpenRouter",
    implemented: true,
    summary: "One key to many hosted models through an OpenAI-compatible gateway.",
  },
  {
    key: "openai-compatible",
    name: "OpenAI-compatible endpoint",
    system: "Custom",
    implemented: true,
    summary: "Any /v1/chat/completions endpoint: Azure, Groq, vLLM, LM Studio, and so on.",
  },
];

export function listProviders(): LlmDescriptor[] {
  return PROVIDER_DESCRIPTORS;
}

/**
 * Build the provider named by the configuration. Returns null when the
 * assistant is off. `transport` is injected for tests; production omits it and
 * uses global fetch.
 */
export function providerFor(config: AiConfig, transport?: Transport): LlmProvider {
  const common = { apiKey: config.apiKey ?? undefined, baseUrl: config.baseUrl ?? undefined, defaultModel: config.model, transport };
  switch (config.provider) {
    case "ollama":
      return ollamaProvider({ baseUrl: config.baseUrl ?? undefined, defaultModel: config.model, transport });
    case "anthropic":
      return new AnthropicProvider({ apiKey: config.apiKey ?? "", defaultModel: config.model, baseUrl: config.baseUrl ?? undefined, transport });
    case "openai":
      return openAiProvider(common);
    case "huggingface":
      return huggingFaceProvider({ ...common, apiKey: config.apiKey ?? "" });
    case "openrouter":
      return openRouterProvider(common);
    case "openai-compatible":
      return new OpenAiCompatibleProvider({
        key: "openai-compatible",
        descriptor: PROVIDER_DESCRIPTORS.find((entry) => entry.key === "openai-compatible")!,
        baseUrl: config.baseUrl ?? "http://127.0.0.1:8000/v1",
        apiKey: config.apiKey ?? undefined,
        defaultModel: config.model,
        transport,
      });
  }
}

/**
 * The provider selected by the environment, or null when the assistant is off.
 * The one place the runtime obtains a provider.
 */
export function configuredProvider(env: AiEnv = process.env as AiEnv, transport?: Transport): LlmProvider | null {
  const config = aiConfig(env);
  return config ? providerFor(config, transport) : null;
}

export type { ProviderKey };
