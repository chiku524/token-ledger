import { ProviderError, ProviderResponseError } from "../errors";
import type { LlmProvider } from "../provider";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  FinishReason,
  LlmDescriptor,
  ToolCall,
  ToolDefinition,
  Transport,
} from "../types";
import { defaultTransport } from "../types";

export interface AnthropicOptions {
  apiKey: string;
  defaultModel: string;
  /** Defaults to the public Anthropic API. */
  baseUrl?: string;
  transport?: Transport;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
/** Anthropic requires a version header on every request. */
const ANTHROPIC_VERSION = "2023-06-01";

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface WireResponse {
  content?: ContentBlock[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/**
 * Anthropic Claude uses the Messages API, whose wire format differs from the
 * OpenAI shape: the system prompt is a top-level field, tool calls are content
 * blocks, and tool results are user-role blocks. This adapter translates both
 * directions so the runtime sees only the neutral shapes.
 */
export class AnthropicProvider implements LlmProvider {
  readonly key = "anthropic" as const;
  readonly descriptor: LlmDescriptor = {
    key: "anthropic",
    name: "Anthropic Claude",
    system: "Anthropic",
    implemented: true,
    summary: "Claude models through the Anthropic Messages API. Tool use supported.",
  };
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly transport: Transport;

  constructor(options: AnthropicOptions) {
    if (!options.apiKey) throw new ProviderError("anthropic", "Anthropic Claude requires an API key.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.defaultModel = options.defaultModel;
    this.transport = options.transport ?? defaultTransport;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const { system, messages } = toAnthropicMessages(request.messages);
    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? 1024,
      messages,
    };
    if (system) body.system = system;
    if (request.tools?.length) body.tools = toAnthropicTools(request.tools);
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await this.transport(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    const json = await this.readJson(response);
    const blocks = json.content ?? [];
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    const toolCalls: ToolCall[] = blocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? "",
        name: block.name ?? "",
        arguments: block.input ?? {},
      }));
    return {
      text,
      toolCalls,
      finishReason: mapStopReason(json.stop_reason, toolCalls),
      usage: json.usage
        ? { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens }
        : undefined,
      model: json.model,
    };
  }

  private async readJson(response: Response): Promise<WireResponse> {
    const text = await response.text();
    let json: WireResponse;
    try {
      json = text ? (JSON.parse(text) as WireResponse) : {};
    } catch {
      throw new ProviderResponseError("anthropic", `non-JSON response (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new ProviderError("anthropic", `Anthropic Claude: ${json.error?.message ?? `HTTP ${response.status}`}`, response.status);
    }
    return json;
  }
}

/** Split a neutral message list into Anthropic's `system` + `messages`. */
export function toAnthropicMessages(messages: ChatMessage[]): { system: string; messages: unknown[] } {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const wire: unknown[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      wire.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }],
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      wire.push({
        role: "assistant",
        content: [
          ...(message.content ? [{ type: "text", text: message.content }] : []),
          ...message.toolCalls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.arguments ?? {} })),
        ],
      });
      continue;
    }
    wire.push({ role: message.role, content: message.content });
  }
  return { system, messages: wire };
}

export function toAnthropicTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
}

export function mapStopReason(reason: string | undefined, toolCalls: ToolCall[]): FinishReason {
  if (reason === "tool_use" || toolCalls.length) return "tool_calls";
  if (reason === "max_tokens") return "length";
  if (reason === "error") return "error";
  return "stop";
}
