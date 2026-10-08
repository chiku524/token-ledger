import type { Role } from "@/auth/roles";
import { listEmbeddingCandidates, type AiMessageRow } from "@/db/ai";
import { cosineSimilarity, type EmbeddingProvider } from "./embeddings/provider";

/**
 * Retrieval over chat message history (#268). Given a query, embed it, rank the
 * organization's embedded messages by cosine similarity, and return the top-k as
 * citable memories for the prompt.
 *
 * Scope is the whole point: the candidate load is org-scoped in the store, and
 * `retrieveRelevant` additionally drops any candidate the requester could not
 * read via the `allow` predicate. A retrieval never widens what the session can
 * see. Offline-testable with a fake embedder.
 */
export interface RetrievalSource {
  threadId: string;
  threadTitle: string;
  messageId: string;
  role: AiMessageRow["role"];
  content: string;
  score: number;
}

export interface RankCandidate {
  messageId: string;
  content: string;
  vector: readonly number[];
}

export interface RetrieveInput {
  organizationId: string;
  query: string;
  embedder: EmbeddingProvider;
  /** Max memories to return. */
  k?: number;
  /** Cosine floor; below this a memory is not considered relevant. */
  floor?: number;
  /** Per-memory character cap for injection. */
  maxCharactersPerMemory?: number;
  /**
   * Whether a candidate may be retrieved. Defaults to allow-all within the org;
   * a caller passes the session's entity-scope rule here so retrieval never
   * crosses it, or excludes the current turn's own message.
   */
  allow?: (candidate: { threadId: string; messageId: string }) => boolean;
}

export interface RankedCandidate<T> {
  candidate: T;
  score: number;
}

/**
 * Rank candidates by cosine similarity, keeping unique, above-floor hits in
 * descending order, capped at `k`.
 */
export function rankBySimilarity<T extends RankCandidate>(
  query: readonly number[],
  candidates: readonly T[],
  options: { k: number; floor: number },
): RankedCandidate<T>[] {
  const scored = candidates
    .map((candidate) => ({ candidate, score: cosineSimilarity(query, candidate.vector) }))
    .filter((entry) => entry.score >= options.floor)
    .sort((a, b) => b.score - a.score);

  // De-duplicate identical content, keeping the best-scoring copy.
  const seen = new Set<string>();
  const unique: RankedCandidate<T>[] = [];
  for (const entry of scored) {
    const key = entry.candidate.content.trim().toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(entry);
    if (unique.length >= options.k) break;
  }
  return unique;
}

/**
 * Retrieve the most relevant past messages for a query, org-scoped and bounded.
 * Returns an empty list (never throws) when there is nothing to retrieve, so a
 * retrieval failure degrades to "no memory", not a broken turn.
 */
export async function retrieveRelevant(input: RetrieveInput): Promise<RetrievalSource[]> {
  const k = input.k ?? 5;
  const floor = input.floor ?? 0.2;
  const query = input.query.trim();
  if (!query) return [];

  const [queryVector] = await input.embedder.embed([query]);
  if (!queryVector?.length) return [];

  const all = await listEmbeddingCandidates(input.organizationId);
  const allowed = input.allow
    ? all.filter((candidate) => input.allow!({ threadId: candidate.threadId, messageId: candidate.messageId }))
    : all;
  if (allowed.length === 0) return [];

  const ranked = rankBySimilarity(queryVector, allowed, { k, floor });
  return ranked.map(({ candidate, score }) => {
    const content = input.maxCharactersPerMemory && candidate.content.length > input.maxCharactersPerMemory
      ? `${candidate.content.slice(0, input.maxCharactersPerMemory)}…`
      : candidate.content;
    return {
      threadId: candidate.threadId,
      threadTitle: candidate.threadTitle,
      messageId: candidate.messageId,
      role: candidate.role,
      content,
      score,
    };
  });
}

/**
 * Format retrieved memories as a context block for the system prompt, with
 * citations so the assistant can say where a fact came from.
 */
export function formatMemories(memories: readonly RetrievalSource[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map(
    (memory, index) =>
      `[${index + 1}] (${memory.threadTitle}${memory.role === "user" ? ", you said" : ", assistant said"}) ${memory.content}`,
  );
  return ["Relevant earlier conversation (retrieved memories; cite them by number if you use them):", ...lines].join("\n");
}

export type { Role };
