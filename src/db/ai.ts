/**
 * The assistant's thread/message/tool-call store.
 *
 * Pure data access: it reads and writes the AI tables but makes no model call
 * and applies no permission logic of its own — the caller (the runtime and its
 * server actions) holds the session and the guards. Every query is scoped by
 * `organizationId`, so a thread is never read across tenants.
 *
 * See docs/adr-ai-assistant.md.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { aiMessageEmbeddings, aiMessages, aiThreads, aiToolCalls, auditEvents } from "./schema";

export type AiMessageRole = "system" | "user" | "assistant" | "tool";
export type AiToolStatus = "proposed" | "confirmed" | "rejected" | "ran" | "failed";

export interface AiThreadRow {
  id: string;
  title: string;
  entityScope: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRow {
  id: string;
  threadId: string;
  role: AiMessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

export interface AiToolCallRow {
  id: string;
  threadId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  status: AiToolStatus;
  requiresConfirm: boolean;
  auditEventId: string | null;
  error: string | null;
  createdAt: string;
}

export interface AppendMessageInput {
  organizationId: string;
  threadId: string;
  role: AiMessageRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface RecordToolCallInput {
  organizationId: string;
  threadId: string;
  messageId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  status: AiToolStatus;
  requiresConfirm?: boolean;
  result?: unknown;
  error?: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Create a thread for a user, snapshotting the entity scope in force. */
export async function createThread(input: {
  organizationId: string;
  userId: string;
  title: string;
  entityScope?: string;
}): Promise<string> {
  const db = getDb();
  const id = newId("aith");
  await db.insert(aiThreads).values({
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    title: input.title,
    entityScope: input.entityScope ?? "",
    archived: false,
  });
  return id;
}

/** Threads for a user, most recently updated first. Never crosses the org or user. */
export async function listThreads(organizationId: string, userId: string, options: { includeArchived?: boolean } = {}): Promise<AiThreadRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiThreads)
    .where(and(eq(aiThreads.organizationId, organizationId), eq(aiThreads.userId, userId)))
    .orderBy(asc(aiThreads.createdAt));
  const filtered = options.includeArchived ? rows : rows.filter((row) => !row.archived);
  return filtered
    .map((row) => ({
      id: row.id,
      title: row.title,
      entityScope: row.entityScope,
      archived: row.archived,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** One thread, scoped to its org and user. Null when it is not yours. */
export async function loadThread(organizationId: string, userId: string, threadId: string): Promise<AiThreadRow | null> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(aiThreads)
      .where(and(eq(aiThreads.id, threadId), eq(aiThreads.organizationId, organizationId), eq(aiThreads.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    entityScope: row.entityScope,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function renameThread(organizationId: string, threadId: string, title: string): Promise<void> {
  const db = getDb();
  await db
    .update(aiThreads)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(aiThreads.id, threadId), eq(aiThreads.organizationId, organizationId)));
}

export async function archiveThread(organizationId: string, threadId: string): Promise<void> {
  const db = getDb();
  await db
    .update(aiThreads)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(aiThreads.id, threadId), eq(aiThreads.organizationId, organizationId)));
}

/** Append a message and touch the thread. Returns the new message id. */
export async function appendMessage(input: AppendMessageInput): Promise<string> {
  const db = getDb();
  const id = newId("aim");
  await db.transaction(async (tx) => {
    await tx.insert(aiMessages).values({
      id,
      organizationId: input.organizationId,
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      provider: input.provider ?? null,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
    });
    await tx.update(aiThreads).set({ updatedAt: new Date() }).where(eq(aiThreads.id, input.threadId));
  });
  return id;
}

/** Messages in a thread, oldest first. */
export async function loadMessages(organizationId: string, threadId: string): Promise<AiMessageRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.organizationId, organizationId), eq(aiMessages.threadId, threadId)))
    .orderBy(asc(aiMessages.createdAt));
  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Record a proposed or resolved tool call. */
export async function recordToolCall(input: RecordToolCallInput): Promise<string> {
  const db = getDb();
  const id = newId("aitc");
  await db.insert(aiToolCalls).values({
    id,
    organizationId: input.organizationId,
    threadId: input.threadId,
    messageId: input.messageId ?? null,
    toolName: input.toolName,
    arguments: input.args,
    result: input.result ?? null,
    status: input.status,
    requiresConfirm: input.requiresConfirm ?? false,
    error: input.error ?? null,
    resolvedAt: input.status === "proposed" ? null : new Date(),
  });
  return id;
}

/** Resolve a proposed tool call: confirmed and run, or rejected. */
export async function resolveToolCall(input: {
  organizationId: string;
  toolCallId: string;
  status: Extract<AiToolStatus, "confirmed" | "rejected" | "ran" | "failed">;
  result?: unknown;
  error?: string | null;
  auditEventId?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(aiToolCalls)
    .set({
      status: input.status,
      result: input.result ?? null,
      error: input.error ?? null,
      auditEventId: input.auditEventId ?? null,
      resolvedAt: new Date(),
    })
    .where(and(eq(aiToolCalls.id, input.toolCallId), eq(aiToolCalls.organizationId, input.organizationId)));
}

/** One tool call by id, scoped to the org. Null when it is not found. */
export async function loadToolCall(organizationId: string, toolCallId: string): Promise<AiToolCallRow | null> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(aiToolCalls)
      .where(and(eq(aiToolCalls.id, toolCallId), eq(aiToolCalls.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.threadId,
    toolName: row.toolName,
    arguments: (row.arguments as Record<string, unknown>) ?? {},
    result: row.result,
    status: row.status,
    requiresConfirm: row.requiresConfirm,
    auditEventId: row.auditEventId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Write the audit row for a tool that ran, so the assistant's action is
 * traceable in History alongside the equivalent UI action.
 */
export async function auditToolRun(input: {
  organizationId: string;
  actor: string;
  toolName: string;
  subjectId: string;
  detail: string;
}): Promise<string> {
  const db = getDb();
  const id = newId("audit");
  await db.insert(auditEvents).values({
    id,
    organizationId: input.organizationId,
    occurredAt: new Date(),
    actor: input.actor,
    action: `assistant.${input.toolName}`,
    subjectType: "ai_tool_call",
    subjectId: input.subjectId,
    detail: input.detail,
  });
  return id;
}

/**
 * Store the embedding for one message, replacing any prior vector for it. The
 * model and dimensions are recorded so a re-embed is possible when the embedder
 * changes. See issue #268.
 */
export async function upsertMessageEmbedding(input: {
  organizationId: string;
  threadId: string;
  messageId: string;
  model: string;
  vector: number[];
}): Promise<void> {
  const db = getDb();
  await db.delete(aiMessageEmbeddings).where(eq(aiMessageEmbeddings.messageId, input.messageId));
  await db.insert(aiMessageEmbeddings).values({
    id: newId("aiemb"),
    organizationId: input.organizationId,
    threadId: input.threadId,
    messageId: input.messageId,
    model: input.model,
    dimensions: input.vector.length,
    vector: input.vector,
  });
}

export interface EmbeddingCandidate {
  messageId: string;
  threadId: string;
  threadTitle: string;
  role: AiMessageRole;
  content: string;
  model: string;
  vector: number[];
}

/**
 * Every embedded message in the organization, with its thread title. Retrieval
 * ranks these in memory (at this scale a cosine scan is enough) but scoping
 * happens here: only rows with `organizationId` equal to the session's org are
 * ever returned. A single-org load is bounded by the embedding table size.
 */
export async function listEmbeddingCandidates(organizationId: string): Promise<EmbeddingCandidate[]> {
  const db = getDb();
  const [embeddings, messages, threads] = await Promise.all([
    db.select().from(aiMessageEmbeddings).where(eq(aiMessageEmbeddings.organizationId, organizationId)),
    db.select().from(aiMessages).where(eq(aiMessages.organizationId, organizationId)),
    db.select().from(aiThreads).where(eq(aiThreads.organizationId, organizationId)),
  ]);
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));

  const candidates: EmbeddingCandidate[] = [];
  for (const embedding of embeddings) {
    const message = messageById.get(embedding.messageId);
    const thread = threadById.get(embedding.threadId);
    if (!message || !thread) continue;
    candidates.push({
      messageId: embedding.messageId,
      threadId: embedding.threadId,
      threadTitle: thread.title,
      role: message.role,
      content: message.content,
      model: embedding.model,
      vector: (embedding.vector as number[]) ?? [],
    });
  }
  return candidates;
}

/** All message ids that already have an embedding, for an idempotent backfill. */
export async function listEmbeddedMessageIds(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ messageId: aiMessageEmbeddings.messageId }).from(aiMessageEmbeddings).where(eq(aiMessageEmbeddings.organizationId, organizationId));
  return rows.map((row) => row.messageId);
}

/** Messages without an embedding, oldest first, for a backfill pass. */
export async function listUnembeddedMessages(organizationId: string, limit = 200): Promise<AiMessageRow[]> {
  const [messages, embedded] = await Promise.all([
    loadAllMessages(organizationId),
    listEmbeddedMessageIds(organizationId),
  ]);
  const embeddedSet = new Set(embedded);
  return messages.filter((message) => !embeddedSet.has(message.id)).slice(0, limit);
}

async function loadAllMessages(organizationId: string): Promise<AiMessageRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.organizationId, organizationId))
    .orderBy(asc(aiMessages.createdAt));
  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  }));
}
