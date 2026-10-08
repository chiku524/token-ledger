import type { LlmProvider } from "../provider";
import type { Transport } from "../types";
import { OpenAiCompatibleProvider } from "./openai-compatible";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  transport?: Transport;
}

/** OpenAI ChatGPT. */
export function openAiProvider(options: ProviderOptions): LlmProvider {
  return new OpenAiCompatibleProvider({
    key: "openai",
    descriptor: {
      key: "openai",
      name: "OpenAI ChatGPT",
      system: "OpenAI",
      implemented: true,
      summary: "GPT models through the OpenAI Chat Completions API. Tool calling supported.",
    },
    baseUrl: options.baseUrl ?? OPENAI_BASE_URL,
    apiKey: options.apiKey,
    defaultModel: options.defaultModel ?? "gpt-4o-mini",
    transport: options.transport,
    requireApiKey: true,
  });
}

/**
 * OpenRouter — one key, many models. Uses the OpenAI wire format with optional
 * attribution headers. See https://openrouter.ai/docs.
 */
export function openRouterProvider(options: ProviderOptions): LlmProvider {
  return new OpenAiCompatibleProvider({
    key: "openrouter",
    descriptor: {
      key: "openrouter",
      name: "OpenRouter",
      system: "OpenRouter",
      implemented: true,
      summary: "One key to many hosted models through an OpenAI-compatible gateway.",
    },
    baseUrl: options.baseUrl ?? OPENROUTER_BASE_URL,
    apiKey: options.apiKey,
    defaultModel: options.defaultModel ?? "nvidia/nemotron-3-super-120b-a12b:free",
    transport: options.transport,
    requireApiKey: true,
    headers: { "http-referer": "https://app.tokenledger.win", "x-title": "Token Ledger" },
  });
}
