import type { CompletionRequest, CompletionResult, LlmDescriptor, StreamEvent } from "./types";

/**
 * The LLM port. Every provider adapter satisfies it, so the agent runtime never
 * depends on a vendor's SDK or wire format. Implementations inject a transport
 * (see `types.ts`), which is how they are tested offline — mirroring the source
 * adapters' injected readers and `docs/adr-adapter-contract.md`.
 */
export interface LlmProvider {
  readonly key: LlmDescriptor["key"];
  readonly descriptor: LlmDescriptor;
  /**
   * A single, non-streamed completion. Always implemented.
   */
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /**
   * A streamed completion. Optional: a provider without a streaming wire format
   * may omit it, and the runtime falls back to `complete`. When present it must
   * end with a `done` event carrying the same `CompletionResult` shape.
   */
  stream?(request: CompletionRequest): AsyncIterable<StreamEvent>;
}
