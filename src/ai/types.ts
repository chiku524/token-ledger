/**
 * Neutral shapes for the assistant's LLM port.
 *
 * A provider adapter (Anthropic, OpenAI, Ollama, Hugging Face, OpenRouter, or
 * any OpenAI-compatible endpoint) maps these shapes to and from its own wire
 * format. The rest of the app — the runtime, the tool registry, the chat route —
 * only ever sees these, so a new provider is one adapter, not a change to the
 * agent. See docs/adr-ai-assistant.md.
 */

export type ProviderKey = "ollama" | "anthropic" | "openai" | "huggingface" | "openrouter" | "openai-compatible";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A JSON Schema object, as sent to a provider's tool/function parameter field. */
export interface JsonSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/** A tool the model may call. `parameters` is JSON Schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/** A tool call the model asked for. `arguments` is already parsed JSON. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** One turn in a conversation, in the port's neutral form. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on an assistant turn that requested tools. */
  toolCalls?: ToolCall[];
  /** Present on a `tool` turn: which call this is the result of. */
  toolCallId?: string;
  /** Present on a `tool` turn: the tool's name. */
  name?: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** When empty or omitted the model is asked to answer in text only. */
  tools?: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "error";

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: FinishReason;
  usage?: TokenUsage;
  /** The model the provider actually used, when it reports one. */
  model?: string;
}

/** A typed event from a streaming completion. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; result: CompletionResult }
  | { type: "error"; message: string };

export interface LlmDescriptor {
  key: ProviderKey;
  name: string;
  /** The vendor or project behind the endpoint. */
  system: string;
  implemented: boolean;
  summary: string;
}

/** Injectable fetch, so every adapter is testable offline. */
export type Transport = (input: string, init?: RequestInit) => Promise<Response>;

export const defaultTransport: Transport = (input, init) => globalThis.fetch(input, init);
