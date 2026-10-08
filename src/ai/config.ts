/**
 * Server-side configuration for the AI assistant.
 *
 * The provider, model and keys are resolved from here — never from user input —
 * exactly as the Solana deployment is resolved in `src/config/solana.ts`. Unset
 * `AI_PROVIDER` means the assistant is off: callers must check `aiConfig()` for
 * null rather than assume a provider exists. A value that is present but
 * malformed fails loudly at startup rather than mid-conversation.
 *
 * See docs/adr-ai-assistant.md and docs/ai-chatbot.md.
 */
import type { ProviderKey } from "./types";
import { PROVIDER_KEYS } from "./registry";

export interface AiConfig {
  provider: ProviderKey;
  /** The model id sent to the provider. */
  model: string;
  /** Hosted providers require a key; Ollama does not. */
  apiKey: string | null;
  /** Endpoint override; otherwise the provider's default base URL is used. */
  baseUrl: string | null;
  temperature: number | null;
  maxTokens: number | null;
}

export interface AiEnv {
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_TEMPERATURE?: string;
  AI_MAX_TOKENS?: string;
  OLLAMA_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

/** Providers that require an API key. Ollama and a local compatible endpoint do not. */
const NEEDS_KEY: Record<ProviderKey, boolean> = {
  ollama: false,
  anthropic: true,
  openai: true,
  huggingface: true,
  openrouter: true,
  cloudflare: true,
  "openai-compatible": false,
};

/** Default model per provider, used when AI_MODEL is unset. */
export const DEFAULT_MODEL: Record<ProviderKey, string> = {
  ollama: "llama3.1",
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
  // A Workers AI model that runs on the Workers Free plan, emits tool calls, and
  // finishes a turn after a tool result. (gpt-oss spends its budget on
  // reasoning_content and can truncate before completing a call.)
  cloudflare: "@cf/qwen/qwen3-30b-a3b-fp8",
  "openai-compatible": "default",
};

/** The env var holding each provider's key, for a clearer error message. */
const KEY_VAR: Record<ProviderKey, string> = {
  ollama: "OLLAMA_BASE_URL",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  cloudflare: "CLOUDFLARE_API_TOKEN",
  "openai-compatible": "AI_API_KEY",
};

/**
 * Read the assistant configuration from the environment. Returns null when no
 * provider is configured (the assistant is off). Throws on an unknown provider,
 * a missing key for a hosted provider, or a malformed number or URL.
 */
export function aiConfig(env: AiEnv = process.env as AiEnv): AiConfig | null {
  const rawProvider = env.AI_PROVIDER?.trim();
  if (!rawProvider) return null;
  if (!(PROVIDER_KEYS as readonly string[]).includes(rawProvider)) {
    throw new Error(`AI_PROVIDER must be one of ${PROVIDER_KEYS.join(", ")}.`);
  }
  const provider = rawProvider as ProviderKey;

  const apiKey = resolveApiKey(provider, env);
  if (NEEDS_KEY[provider] && !apiKey) {
    throw new Error(`${KEY_VAR[provider]} is required when AI_PROVIDER is "${provider}".`);
  }

  return {
    provider,
    model: env.AI_MODEL?.trim() || DEFAULT_MODEL[provider],
    apiKey,
    baseUrl: readBaseUrl(provider, env),
    temperature: readNumber(env.AI_TEMPERATURE, "AI_TEMPERATURE", { min: 0, max: 2 }),
    maxTokens: readNumber(env.AI_MAX_TOKENS, "AI_MAX_TOKENS", { min: 1 }),
  };
}

/** Whether the assistant is configured. Safe to call with no database. */
export function assistantConfigured(env: AiEnv = process.env as AiEnv): boolean {
  try {
    return aiConfig(env) !== null;
  } catch {
    // A misconfigured provider is not "configured"; the throw surfaces when the
    // assistant is actually used.
    return env.AI_PROVIDER?.trim() ? true : false;
  }
}

function resolveApiKey(provider: ProviderKey, env: AiEnv): string | null {
  const specific = provider === "anthropic" ? env.ANTHROPIC_API_KEY
    : provider === "openai" ? env.OPENAI_API_KEY
    : provider === "huggingface" ? env.HUGGINGFACE_API_KEY
    : provider === "openrouter" ? env.OPENROUTER_API_KEY
    : provider === "cloudflare" ? env.CLOUDFLARE_API_TOKEN
    : undefined;
  return (specific ?? env.AI_API_KEY)?.trim() || null;
}

/** Cloudflare Workers AI's OpenAI-compatible endpoint, from the account id. */
export function cloudflareBaseUrl(accountId: string | undefined): string | null {
  const id = accountId?.trim();
  if (!id) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`;
}

function readBaseUrl(provider: ProviderKey, env: AiEnv): string | null {
  // Cloudflare's base URL is derived from the account id, not set by hand.
  if (provider === "cloudflare" && !env.AI_BASE_URL?.trim()) {
    const derived = cloudflareBaseUrl(env.CLOUDFLARE_ACCOUNT_ID);
    if (!derived) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID is required when AI_PROVIDER is \"cloudflare\".");
    }
    return derived;
  }
  const raw = provider === "ollama" ? (env.OLLAMA_BASE_URL ?? env.AI_BASE_URL) : (env.AI_BASE_URL ?? env.OLLAMA_BASE_URL);
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("AI_BASE_URL must be a valid URL.");
  }
  // A local Ollama daemon is http; a hosted provider must be https. Credentials
  // never belong in the URL — they go in the key.
  const local = provider === "ollama" || provider === "openai-compatible";
  if (!local && url.protocol !== "https:") {
    throw new Error("AI_BASE_URL must be https:// for a hosted provider.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("AI_BASE_URL must not embed credentials in the URL.");
  }
  return trimmed.replace(/\/+$/, "");
}

function readNumber(
  value: string | undefined,
  name: string,
  bounds: { min: number; max?: number },
): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < bounds.min || (bounds.max !== undefined && parsed > bounds.max)) {
    throw new Error(`${name} must be a number ${bounds.max !== undefined ? `between ${bounds.min} and ${bounds.max}` : `at least ${bounds.min}`}.`);
  }
  return parsed;
}
