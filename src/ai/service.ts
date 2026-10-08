import type { LlmProvider } from "./provider";
import type { EmbeddingProvider } from "./embeddings/provider";
import { formatMemories, retrieveRelevant } from "./retrieval";
import { runAssistantTurn, type AssistantTurn, type RunTurnInput } from "./runtime";
import type { ChatMessage } from "./types";

/**
 * The assistant service: one place that builds the prompt context (including
 * RAG memories), runs the runtime, and returns the turn. Kept separate from the
 * route so it is unit-testable and so the same path serves both the streaming
 * route and a potential non-streaming caller.
 */
export interface AssistantDeps {
  provider: LlmProvider;
  /** Optional. When absent, retrieval is off and the turn behaves as before. */
  embedder?: EmbeddingProvider | null;
  /** Whether to retrieve memories at all (a per-thread toggle can disable it). */
  memory?: boolean;
  /** Sampling tuning from the deployment config. */
  temperature?: number | null;
  maxTokens?: number | null;
}

export interface RunAssistantInput extends Omit<RunTurnInput, "provider" | "context"> {
  deps: AssistantDeps;
}

const MEMORY_K = 5;

/**
 * Run a turn with retrieval. Retrieval is best-effort: a failure to embed or
 * rank degrades to no memories and the turn still runs (issue #268).
 */
export async function assistantReply(input: RunAssistantInput): Promise<AssistantTurn> {
  const { deps, ctx } = input;
  let context = "";
  if (deps.embedder && deps.memory !== false && !input.confirm) {
    try {
      const memories = await retrieveRelevant({
        organizationId: ctx.session.organizationId,
        query: input.userText,
        embedder: deps.embedder,
        k: MEMORY_K,
        maxCharactersPerMemory: 1200,
      });
      context = formatMemories(memories);
    } catch {
      // No memory on a retrieval failure; never block the turn on RAG.
      context = "";
    }
  }

  return runAssistantTurn({
    provider: deps.provider,
    ctx,
    history: input.history,
    userText: input.userText,
    confirm: input.confirm,
    context: context || undefined,
    temperature: deps.temperature ?? undefined,
    maxTokens: deps.maxTokens ?? undefined,
  });
}

/** Map stored messages to the neutral history the provider reads. */
export function toHistory(messages: readonly { role: string; content: string }[]): ChatMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as ChatMessage["role"], content: message.content }));
}
