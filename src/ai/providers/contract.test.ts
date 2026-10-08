/**
 * The provider contract, wired for every provider.
 *
 * No network: each provider is built with a faked transport that returns a
 * canned response in that provider's own wire format. The registry-coverage
 * test at the bottom fails if a provider in `PROVIDER_KEYS` has no case, so a
 * new provider cannot silently skip the contract.
 */
import { describe, expect, it } from "vitest";
import { PROVIDER_KEYS, listProviders } from "../registry";
import { jsonResponse, runProviderContract, textResponse, type ProviderContractCase } from "../provider-contract";
import type { CompletionRequest, Transport } from "../types";
import { AnthropicProvider } from "./anthropic";
import { huggingFaceProvider } from "./huggingface";
import { ollamaProvider } from "./ollama";
import { openAiProvider, openRouterProvider } from "./openai";
import { OpenAiCompatibleProvider } from "./openai-compatible";

const TEXT = "I can help with that.";
const ROUTE = "/dashboard/reconciliation";
const TOOL_ARGUMENTS = { route: ROUTE };

const plainRequest: CompletionRequest = { messages: [{ role: "user", content: "hello" }] };
const toolRequest: CompletionRequest = {
  messages: [{ role: "user", content: "open matching" }],
  tools: [
    {
      name: "navigate",
      description: "Open a dashboard page.",
      parameters: { type: "object", properties: { route: { type: "string" } }, required: ["route"] },
    },
  ],
};

/** An OpenAI-shaped transport: tool call when tools are offered, text otherwise. */
function openAiTransport(): Transport {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
    if (body.tools?.length) {
      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call_1", type: "function", function: { name: "navigate", arguments: JSON.stringify(TOOL_ARGUMENTS) } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    }
    return jsonResponse({ choices: [{ message: { role: "assistant", content: TEXT }, finish_reason: "stop" }] });
  };
}

/** An Anthropic-shaped transport. */
function anthropicTransport(): Transport {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
    if (body.tools?.length) {
      return jsonResponse({
        content: [{ type: "tool_use", id: "toolu_1", name: "navigate", input: TOOL_ARGUMENTS }],
        stop_reason: "tool_use",
      });
    }
    return jsonResponse({ content: [{ type: "text", text: TEXT }], stop_reason: "end_turn" });
  };
}

const failingTransport: Transport = async () => jsonResponse({ error: { message: "rate limited" } }, 429);
const malformedTransport: Transport = async () => textResponse("<html>gateway error</html>");

function openAiCase(name: string, make: (transport: Transport) => ProviderContractCase["provider"]): ProviderContractCase {
  return {
    name,
    provider: make(openAiTransport()),
    failing: make(failingTransport),
    malformed: make(malformedTransport),
    request: plainRequest,
    toolRequest,
    expectedToolCall: { name: "navigate", arguments: TOOL_ARGUMENTS },
  };
}

const cases: ProviderContractCase[] = [
  openAiCase("Ollama", (transport) => ollamaProvider({ transport })),
  openAiCase("OpenAI ChatGPT", (transport) => openAiProvider({ apiKey: "test-key", transport })),
  openAiCase("Hugging Face", (transport) => huggingFaceProvider({ apiKey: "test-key", transport })),
  openAiCase("OpenRouter", (transport) => openRouterProvider({ apiKey: "test-key", transport })),
  openAiCase(
    "Cloudflare Workers AI",
    (transport) =>
      new OpenAiCompatibleProvider({
        key: "cloudflare",
        descriptor: { key: "cloudflare", name: "Cloudflare Workers AI", system: "Cloudflare", implemented: true, summary: "" },
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/account/ai/v1",
        apiKey: "test-key",
        defaultModel: "@cf/meta/llama-3.1-8b-instruct-fp8",
        transport,
        requireApiKey: true,
        emptyContentForToolCalls: true,
      }),
  ),
  openAiCase(
    "OpenAI-compatible",
    (transport) =>
      new OpenAiCompatibleProvider({
        key: "openai-compatible",
        descriptor: { key: "openai-compatible", name: "Custom", system: "Custom", implemented: true, summary: "" },
        baseUrl: "http://127.0.0.1:8000/v1",
        defaultModel: "default",
        transport,
      }),
  ),
  {
    name: "Anthropic Claude",
    provider: new AnthropicProvider({ apiKey: "test-key", defaultModel: "claude-3-5-sonnet-latest", transport: anthropicTransport() }),
    failing: new AnthropicProvider({ apiKey: "test-key", defaultModel: "claude-3-5-sonnet-latest", transport: failingTransport }),
    malformed: new AnthropicProvider({ apiKey: "test-key", defaultModel: "claude-3-5-sonnet-latest", transport: malformedTransport }),
    request: plainRequest,
    toolRequest,
    expectedToolCall: { name: "navigate", arguments: TOOL_ARGUMENTS },
  },
];

for (const testCase of cases) {
  runProviderContract(testCase);
}

describe("provider registry coverage", () => {
  it("every provider key has a contract case", () => {
    const covered = new Set(cases.map((testCase) => testCase.name));
    expect(covered.size).toBe(PROVIDER_KEYS.length);
  });

  it("lists every provider as implemented", () => {
    const providers = listProviders();
    expect(providers.map((provider) => provider.key).sort()).toEqual([...PROVIDER_KEYS].sort());
    expect(providers.every((provider) => provider.implemented)).toBe(true);
  });
});
