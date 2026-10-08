/**
 * A curated catalog of assistant models an owner/admin can choose from, with a
 * note on whether each is free and whether it reliably calls tools. This is a
 * convenience list, not an allowlist: a selection may also be a custom model id.
 *
 * Only models that call tools are useful here — the assistant drives tools, so a
 * model that returns the schema as text or refuses to call does not work. See
 * docs/adr-ai-assistant.md.
 */
import type { ProviderKey } from "./types";

export interface CatalogModel {
  id: string;
  label: string;
  /** No per-token cost (a free tier / free model). */
  free: boolean;
  /** Verified to emit real tool calls against this app. */
  tools: boolean;
}

/** Models offered per provider, best-first. */
export const MODEL_CATALOG: Record<ProviderKey, CatalogModel[]> = {
  cloudflare: [
    { id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B A3B", free: true, tools: true },
    { id: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B", free: true, tools: true },
    { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B", free: true, tools: true },
    { id: "@cf/meta/llama-3.1-8b-instruct-fp8", label: "Llama 3.1 8B", free: true, tools: true },
    { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 24B", free: true, tools: true },
  ],
  openrouter: [
    { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (free)", free: true, tools: true },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B (free)", free: true, tools: true },
    { id: "dots-studio/dots-3-note-preview:free", label: "Dots 3 Note (free)", free: true, tools: true },
    { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini", free: false, tools: true },
    { id: "anthropic/claude-3.5-sonnet", label: "Anthropic Claude 3.5 Sonnet", free: false, tools: true },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini", free: false, tools: true },
    { id: "gpt-4o", label: "GPT-4o", free: false, tools: true },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", free: false, tools: true },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", free: false, tools: true },
  ],
  huggingface: [
    { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct", free: false, tools: true },
  ],
  ollama: [
    { id: "llama3.1", label: "Llama 3.1 (local)", free: true, tools: true },
    { id: "qwen2.5", label: "Qwen 2.5 (local)", free: true, tools: true },
  ],
  "openai-compatible": [
    { id: "default", label: "Default (server-configured)", free: true, tools: true },
  ],
};

export function modelsFor(provider: ProviderKey): CatalogModel[] {
  return MODEL_CATALOG[provider] ?? [];
}
