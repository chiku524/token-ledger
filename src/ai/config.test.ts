import { describe, expect, it } from "vitest";
import { aiConfig, assistantConfigured, DEFAULT_MODEL } from "./config";
import { configuredProvider, listProviders, PROVIDER_KEYS } from "./registry";

describe("aiConfig", () => {
  it("is null when no provider is configured", () => {
    expect(aiConfig({})).toBeNull();
    expect(aiConfig({ AI_PROVIDER: "  " })).toBeNull();
  });

  it("rejects an unknown provider", () => {
    expect(() => aiConfig({ AI_PROVIDER: "not-a-provider" })).toThrow(/AI_PROVIDER must be one of/i);
  });

  it("requires a key for a hosted provider but not for Ollama", () => {
    expect(() => aiConfig({ AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => aiConfig({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(aiConfig({ AI_PROVIDER: "ollama" })?.provider).toBe("ollama");
  });

  it("falls back to a per-provider default model", () => {
    expect(aiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" })?.model).toBe(DEFAULT_MODEL.openai);
    expect(aiConfig({ AI_PROVIDER: "ollama", AI_MODEL: "qwen2.5" })?.model).toBe("qwen2.5");
  });

  it("accepts a generic AI_API_KEY for any hosted provider", () => {
    expect(aiConfig({ AI_PROVIDER: "openrouter", AI_API_KEY: "k" })?.apiKey).toBe("k");
  });

  it("derives the Cloudflare Workers AI base URL from the account id", () => {
    const config = aiConfig({ AI_PROVIDER: "cloudflare", CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acct_123" });
    expect(config?.baseUrl).toBe("https://api.cloudflare.com/client/v4/accounts/acct_123/ai/v1");
    expect(config?.model).toBe(DEFAULT_MODEL.cloudflare);
    expect(config?.apiKey).toBe("tok");
  });

  it("requires a token and account id for Cloudflare", () => {
    expect(() => aiConfig({ AI_PROVIDER: "cloudflare", CLOUDFLARE_ACCOUNT_ID: "acct" })).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(() => aiConfig({ AI_PROVIDER: "cloudflare", CLOUDFLARE_API_TOKEN: "tok" })).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("parses tuning values and rejects out-of-range ones", () => {
    const config = aiConfig({ AI_PROVIDER: "ollama", AI_TEMPERATURE: "0.2", AI_MAX_TOKENS: "512" });
    expect(config?.temperature).toBe(0.2);
    expect(config?.maxTokens).toBe(512);
    expect(() => aiConfig({ AI_PROVIDER: "ollama", AI_TEMPERATURE: "5" })).toThrow(/AI_TEMPERATURE/);
    expect(() => aiConfig({ AI_PROVIDER: "ollama", AI_MAX_TOKENS: "0" })).toThrow(/AI_MAX_TOKENS/);
  });

  it("requires https for a hosted base URL but allows http for local Ollama", () => {
    expect(() => aiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", AI_BASE_URL: "http://api.example.com" })).toThrow(/https/i);
    expect(aiConfig({ AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://127.0.0.1:11434" })?.baseUrl).toBe("http://127.0.0.1:11434");
    expect(() => aiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", AI_BASE_URL: "https://u:p@example.com" })).toThrow(/credentials/i);
  });
});

describe("assistantConfigured", () => {
  it("is true only when a provider is set", () => {
    expect(assistantConfigured({})).toBe(false);
    expect(assistantConfigured({ AI_PROVIDER: "ollama" })).toBe(true);
    // A misconfigured provider still counts as "configured"; the throw surfaces on use.
    expect(assistantConfigured({ AI_PROVIDER: "openai" })).toBe(true);
  });
});

describe("registry", () => {
  it("lists every provider key", () => {
    expect(listProviders().map((provider) => provider.key).sort()).toEqual([...PROVIDER_KEYS].sort());
  });

  it("builds the configured provider, or null when off", () => {
    expect(configuredProvider({})).toBeNull();
    expect(configuredProvider({ AI_PROVIDER: "ollama" })?.key).toBe("ollama");
    expect(configuredProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })?.key).toBe("anthropic");
  });
});
