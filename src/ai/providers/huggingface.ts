import type { LlmProvider } from "../provider";
import type { Transport } from "../types";
import { OpenAiCompatibleProvider } from "./openai-compatible";

/**
 * Hugging Face's inference router exposes an OpenAI-compatible chat completions
 * endpoint, so this reuses the shared adapter. See
 * https://huggingface.co/docs/inference-providers.
 */
const HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1";

export interface HuggingFaceOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  transport?: Transport;
}

export function huggingFaceProvider(options: HuggingFaceOptions): LlmProvider {
  return new OpenAiCompatibleProvider({
    key: "huggingface",
    descriptor: {
      key: "huggingface",
      name: "Hugging Face",
      system: "Hugging Face",
      implemented: true,
      summary: "Hosted open models through Hugging Face Inference Providers (OpenAI-compatible).",
    },
    baseUrl: options.baseUrl ?? HUGGINGFACE_BASE_URL,
    apiKey: options.apiKey,
    defaultModel: options.defaultModel ?? "meta-llama/Llama-3.3-70B-Instruct",
    transport: options.transport,
    requireApiKey: true,
  });
}
