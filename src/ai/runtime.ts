import { AuthError } from "@/auth/current";
import type { LlmProvider } from "./provider";
import { buildSystemPrompt, refusalFor } from "./prompt";
import { toolsFor } from "./tools/registry";
import type { AgentTool, ToolContext, ToolPreview, ToolResult } from "./tools/types";
import type { ChatMessage, JsonSchema, ToolCall, ToolDefinition } from "./types";
import { ProviderError } from "./errors";

/** How many model ↔ tool rounds one user turn may run before it stops. */
export const MAX_TOOL_ITERATIONS = 6;

export interface ProposedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  requiresConfirm: boolean;
  /** What the write will do, for the confirmation card. Side-effect-free. */
  preview?: ToolPreview;
  /** Present for a read tool: the result already obtained. */
  result?: ToolResult;
}

export interface AssistantTurn {
  /** The assistant's text for this turn. */
  text: string;
  /** A page the turn decided to open, if any. */
  route?: string;
  /** Read-tool results obtained this turn (already run). */
  readResults: { tool: string; result: ToolResult }[];
  /** A write the user must confirm, if any. Exactly one per turn. */
  proposal?: ProposedToolCall;
  /** Set when the turn is a hard refusal. */
  refusal?: string;
  status: "answered" | "awaiting_confirmation" | "refused" | "error";
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: string;
  provider?: string;
}

export interface RunTurnInput {
  provider: LlmProvider;
  ctx: ToolContext;
  /** The conversation so far (system excluded; the runtime adds it). */
  history: ChatMessage[];
  userText: string;
  /** Extra context (retrieved memories) inserted after the system prompt. */
  context?: string;
  /** When set, the turn confirms and runs this write tool call instead of planning. */
  confirm?: { toolName: string; arguments: Record<string, unknown> };
  /** Sampling tuning from the deployment config. */
  temperature?: number | null;
  maxTokens?: number | null;
}

function asToolDefinitions(tools: readonly AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters as JsonSchema }));
}

/** Turn a tool result into the text a `tool` message carries back to the model. */
function serializeResult(result: ToolResult): string {
  const payload = result.data === undefined ? null : result.data;
  return JSON.stringify({ summary: result.summary, route: result.route ?? null, data: payload }).slice(0, 8000);
}

/**
 * Run one user turn: the model answers, navigates, or proposes a write.
 *
 * The loop is deliberately small. Read tools run immediately; the first write
 * tool the model asks for ends the loop as a proposal and the turn waits for a
 * confirmation. A `confirm` input runs that one write and returns its result.
 * No write ever runs here without an explicit `confirm` — the UI supplies it
 * from a user's click. See docs/ai-chatbot.md §5 and docs/adr-ai-assistant.md.
 */
export async function runAssistantTurn(input: RunTurnInput): Promise<AssistantTurn> {
  const { provider, ctx } = input;
  const available = toolsFor(ctx);
  const byName = new Map(available.map((tool) => [tool.name, tool]));

  // A confirmation turn: run exactly the confirmed write, under its guard.
  if (input.confirm) {
    const tool = byName.get(input.confirm.toolName);
    if (!tool || tool.kind !== "write") {
      return { text: "That action is not available.", status: "error", readResults: [] };
    }
    const result = await runTool(tool, input.confirm.arguments, ctx);
    return {
      text: result.summary,
      route: result.route,
      readResults: [{ tool: tool.name, result }],
      status: "answered",
      provider: provider.key,
    };
  }

  const refusal = refusalFor(input.userText);
  if (refusal) {
    return { text: refusal, status: "refused", readResults: [], refusal };
  }

  const definitions = asToolDefinitions(available);
  const system = buildSystemPrompt(ctx, definitions);
  const messages: ChatMessage[] = [
    { role: "system", content: input.context ? `${system}\n\n${input.context}` : system },
    ...input.history,
    { role: "user", content: input.userText },
  ];

  const readResults: { tool: string; result: ToolResult }[] = [];
  let lastUsage: AssistantTurn["usage"];
  let lastModel: string | undefined;
  let route: string | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    let completion;
    try {
      completion = await provider.complete({
        messages,
        tools: definitions,
        temperature: input.temperature ?? undefined,
        maxTokens: input.maxTokens ?? undefined,
      });
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : "The assistant is temporarily unavailable.";
      return { text: message, status: "error", readResults, provider: provider.key };
    }
    lastUsage = completion.usage;
    lastModel = completion.model;

    if (!completion.toolCalls.length) {
      return { text: completion.text, route, status: "answered", readResults, usage: lastUsage, model: lastModel, provider: provider.key };
    }

    // Record the assistant's tool request so the model sees its own call next round.
    messages.push({ role: "assistant", content: completion.text, toolCalls: completion.toolCalls });

    let proposed: ProposedToolCall | undefined;

    for (const call of completion.toolCalls) {
      const tool = byName.get(call.name);
      if (!tool) {
        messages.push(toolMessage(call, JSON.stringify({ error: `Unknown tool ${call.name}.` })));
        continue;
      }
      if (tool.kind === "write") {
        // The first write ends the turn as a proposal; any reads the model asked
        // for in the same round already ran above. Build the side-effect-free
        // preview now so the confirmation card can show what it will do.
        let preview: ToolPreview | undefined;
        if (tool.preview) {
          try {
            preview = await tool.preview(call.arguments, ctx);
          } catch {
            preview = undefined;
          }
        }
        proposed = { tool: tool.name, arguments: call.arguments, requiresConfirm: true, preview };
        break;
      }
      const result = await runTool(tool, call.arguments, ctx);
      readResults.push({ tool: tool.name, result });
      if (result.route) route = result.route;
      messages.push(toolMessage(call, serializeResult(result)));
    }

    if (proposed) {
      return {
        text: completion.text || `Confirm: ${proposed.tool}.`,
        route,
        readResults,
        proposal: proposed,
        status: "awaiting_confirmation",
        usage: lastUsage,
        model: lastModel,
        provider: provider.key,
      };
    }
  }

  // The model kept calling tools without settling. Fail closed, not open.
  return {
    text: "I couldn't finish that in one step. Try asking more specifically.",
    status: "error",
    readResults,
    usage: lastUsage,
    model: lastModel,
    provider: provider.key,
  };
}

function toolMessage(call: ToolCall, content: string): ChatMessage {
  return { role: "tool", content, toolCallId: call.id, name: call.name };
}

/** Run a tool, converting a thrown guard error into a result the model can read. */
async function runTool(tool: AgentTool, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  try {
    return await tool.execute(args, ctx);
  } catch (error) {
    if (error instanceof AuthError) return { summary: error.message };
    return { summary: error instanceof Error ? error.message : "That action failed." };
  }
}
