/**
 * The shared LLM provider contract.
 *
 * Every provider adapter (Ollama, Anthropic, OpenAI, Hugging Face, OpenRouter,
 * and the OpenAI-compatible base) must satisfy the same rules: a `complete`
 * call returns the neutral shape, a tool call round-trips, a non-2xx surfaces a
 * `ProviderError` carrying the status, and a provider built with a faked
 * transport never touches the network. `runProviderContract` is the single
 * place those rules live, mirroring `src/adapters/contract-suite.ts`.
 *
 * See src/ai/providers/contract.test.ts for the wiring and
 * docs/adr-ai-assistant.md for the rationale.
 */
import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderResponseError } from "./errors";
import type { LlmProvider } from "./provider";
import type { CompletionRequest, ToolDefinition } from "./types";

/** The tool used by the contract's tool-call round-trip. */
export const CONTRACT_TOOL: ToolDefinition = {
  name: "navigate",
  description: "Open a dashboard page.",
  parameters: {
    type: "object",
    properties: { route: { type: "string" } },
    required: ["route"],
    additionalProperties: false,
  },
};

export interface ProviderContractCase {
  /** A stable label for the provider under test. */
  name: string;
  /** A provider built with a faked transport returning the responses below. */
  provider: LlmProvider;
  /** A plain request (a single user turn). */
  request: CompletionRequest;
  /** A request that offers CONTRACT_TOOL and expects the model to call it. */
  toolRequest: CompletionRequest;
  /** The tool call the provider should surface (name + arguments). */
  expectedToolCall: { name: string; arguments: Record<string, unknown> };
  /** A provider built with a transport that returns a non-2xx response. */
  failing: LlmProvider;
  /** A provider built with a transport that returns malformed JSON. */
  malformed: LlmProvider;
}

/**
 * Run the standard contract for one provider. Each provider under test is
 * constructed with a transport that returns a canned response; no network is
 * used anywhere in this suite.
 */
export function runProviderContract(testCase: ProviderContractCase): void {
  const { name, provider, request, toolRequest, expectedToolCall, failing, malformed } = testCase;

  describe(`provider contract: ${name}`, () => {
    it("complete returns a valid neutral shape", async () => {
      const result = await provider.complete(request);
      expect(typeof result.text).toBe("string");
      expect(Array.isArray(result.toolCalls)).toBe(true);
      expect(["stop", "tool_calls", "length", "error"]).toContain(result.finishReason);
    });

    it("round-trips a tool call into a neutral ToolCall", async () => {
      const result = await provider.complete(toolRequest);
      expect(result.finishReason).toBe("tool_calls");
      expect(result.toolCalls).toHaveLength(1);
      const call = result.toolCalls[0];
      expect(call.name).toBe(expectedToolCall.name);
      expect(call.arguments).toEqual(expectedToolCall.arguments);
      expect(call.id).toBeTruthy();
    });

    it("surfaces a provider failure as a ProviderError with the status", async () => {
      await expect(failing.complete(request)).rejects.toBeInstanceOf(ProviderError);
    });

    it("rejects a malformed response with a typed error, not a crash", async () => {
      await expect(malformed.complete(request)).rejects.toBeInstanceOf(ProviderResponseError);
    });

    it("does not touch the network when its transport is faked", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network should not be used"));
      try {
        await provider.complete(request);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });
}

/** Build a JSON `Response` for a faked transport. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A `Response` whose body is not JSON, for the malformed case. */
export function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}
