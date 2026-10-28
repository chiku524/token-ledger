import type { LlmProvider } from "./provider";
import type { EmbeddingProvider } from "./embeddings/provider";
import type { OrganizationAccountType } from "@/data/account-type";
import { filterMemoriesFor, scrubHiddenSectionLinks, scrubStoredMessages } from "./hidden-sections";
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
  /** The id of the user message being answered; excluded from its own retrieval. */
  excludeMessageId?: string | null;
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
        // The turn's own message was just embedded; never retrieve it as a memory.
        allow: deps.excludeMessageId
          ? (candidate) => candidate.messageId !== deps.excludeMessageId
          : undefined,
      });
      // An individual is never shown a memory that names or links a section it does not have.
      context = formatMemories(filterMemoriesFor(memories, ctx.session.accountType));
    } catch {
      // No memory on a retrieval failure; never block the turn on RAG.
      context = "";
    }
  }

  const turn = await runAssistantTurn({
    provider: deps.provider,
    ctx,
    history: input.history,
    userText: input.userText,
    confirm: input.confirm,
    context: context || undefined,
    temperature: deps.temperature ?? undefined,
    maxTokens: deps.maxTokens ?? undefined,
  });
  // The reply is stored and later restored, so an individual's never carries a link to a hidden section.
  return { ...turn, text: scrubHiddenSectionLinks(turn.text, ctx.session.accountType) };
}

/**
 * Map stored messages to the neutral history the provider reads. For an individual,
 * links to sections its account does not have are removed from the assistant's old
 * replies so the model does not repeat them.
 */
export function toHistory(messages: readonly { role: string; content: string }[], accountType?: OrganizationAccountType): ChatMessage[] {
  return scrubStoredMessages(messages, accountType)
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as ChatMessage["role"], content: message.content }));
}
