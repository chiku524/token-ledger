"use server";

/**
 * The assistant's server actions. They hold the session and the guards and call
 * the same runtime the streaming route uses. A write tool is never executed
 * here without the user's explicit confirmation: the plan is recorded as a
 * proposal by `sendMessageAction`, and only `confirmToolCallAction` runs it.
 *
 * When `AI_PROVIDER` is unset the assistant is off, and these actions return a
 * clear state rather than erroring — the same "features off" contract as
 * `solanaDeployment()`.
 */
import { actorName, assertCsrf, AuthError, requireSession } from "@/auth/current";
import { aiConfig } from "@/ai/config";
import { configuredProvider } from "@/ai/registry";
import { configuredEmbedder } from "@/ai/embeddings/config";
import { indexMessageEmbedding } from "@/ai/embeddings/index-message";
import { assistantReply, toHistory } from "@/ai/service";
import { toolByName } from "@/ai/tools/registry";
import { loadToolContext } from "@/ai/context";
import { appendMessage, loadMessages, loadToolCall, recordToolCall, resolveToolCall, auditToolRun, createThread, loadThread } from "@/db/ai";
import { hasDatabase } from "@/db/availability";
import { can } from "@/auth/roles";
import { fail } from "./form-state";

export type ChatActionResult =
  | { status: "answered"; threadId: string; text: string; route?: string }
  | { status: "awaiting_confirmation"; threadId: string; text: string; toolCallId: string; tool: string; route?: string }
  | { status: "refused"; threadId: string; text: string }
  | { status: "off"; text: string }
  | { status: "error"; text: string };

const OFF = "The assistant is not configured on this deployment.";

/** Sampling tuning from the deployment config, tolerant of a misconfiguration. */
function tuning(): { temperature: number | null; maxTokens: number | null } {
  try {
    const config = aiConfig();
    return { temperature: config?.temperature ?? null, maxTokens: config?.maxTokens ?? null };
  } catch {
    return { temperature: null, maxTokens: null };
  }
}

/** A short thread title from the first user message. */
function titleFrom(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New conversation";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

/**
 * Append the user's message, run the assistant, persist the reply, and either
 * answer or record a proposed write for confirmation.
 */
export async function sendMessageAction(formData: FormData): Promise<ChatActionResult> {
  try {
    await assertCsrf(formData);
  } catch (error) {
    return { status: "error", text: error instanceof AuthError ? error.message : "The form expired. Refresh and try again." };
  }
  const session = await requireSession();
  if (!can(session.role, "books.read")) return { status: "error", text: "You do not have permission to use the assistant." };
  if (!hasDatabase()) return { status: "error", text: "The assistant needs a database to keep a conversation." };

  let provider;
  try {
    provider = configuredProvider();
  } catch (error) {
    return { status: "error", text: error instanceof Error ? error.message : OFF };
  }
  if (!provider) return { status: "off", text: OFF };
  if (!session.organizationId) return { status: "error", text: "No organization on this session." };

  const userText = String(formData.get("message") ?? "").trim();
  if (!userText) return { status: "error", text: "Type a message." };

  const threadId = String(formData.get("threadId") ?? "").trim();
  const resolvedThread = threadId
    ? await loadThread(session.organizationId, session.id, threadId)
    : null;
  const activeThreadId = resolvedThread?.id ?? (await createThread({
    organizationId: session.organizationId,
    userId: session.id,
    title: titleFrom(userText),
    entityScope: session.entityScope.join(","),
  }));

  const userMessageId = await appendMessage({ organizationId: session.organizationId, threadId: activeThreadId, role: "user", content: userText });
  await indexMessageEmbedding({ organizationId: session.organizationId, threadId: activeThreadId, messageId: userMessageId, content: userText });

  const ctx = await loadToolContext(session.demo ? null : String(formData.get("csrf") ?? "") || null);
  if (!ctx) return { status: "error", text: "Your session ended. Sign in again." };

  const historyRows = await loadMessages(session.organizationId, activeThreadId);
  const history = toHistory(historyRows.slice(0, -1));

  let turn;
  try {
    turn = await assistantReply({
      deps: { provider, embedder: configuredEmbedder(), memory: formData.get("memory") !== "off", excludeMessageId: userMessageId, ...tuning() },
      ctx,
      history,
      userText,
    });
  } catch (error) {
    return { status: "error", text: error instanceof Error ? error.message : "The assistant failed." };
  }

  const assistantMessageId = await appendMessage({
    organizationId: session.organizationId,
    threadId: activeThreadId,
    role: "assistant",
    content: turn.text,
    provider: turn.provider ?? null,
    model: turn.model ?? null,
    inputTokens: turn.usage?.inputTokens ?? null,
    outputTokens: turn.usage?.outputTokens ?? null,
  });
  await indexMessageEmbedding({ organizationId: session.organizationId, threadId: activeThreadId, messageId: assistantMessageId, content: turn.text });

  if (turn.status === "awaiting_confirmation" && turn.proposal) {
    const toolCallId = await recordToolCall({
      organizationId: session.organizationId,
      threadId: activeThreadId,
      messageId: assistantMessageId,
      toolName: turn.proposal.tool,
      args: turn.proposal.arguments,
      status: "proposed",
      requiresConfirm: true,
    });
    return { status: "awaiting_confirmation", threadId: activeThreadId, text: turn.text, toolCallId, tool: turn.proposal.tool, route: turn.route };
  }
  if (turn.status === "refused") return { status: "refused", threadId: activeThreadId, text: turn.text };
  return { status: "answered", threadId: activeThreadId, text: turn.text, route: turn.route };
}

/**
 * Run or reject a proposed write. Only a call currently in `proposed` can be
 * resolved, so a replayed confirm is a no-op. The write runs through the same
 * tool (and therefore the same guard) the runtime uses.
 */
export async function confirmToolCallAction(formData: FormData): Promise<ChatActionResult> {
  try {
    await assertCsrf(formData);
  } catch (error) {
    return { status: "error", text: error instanceof AuthError ? error.message : "The form expired. Refresh and try again." };
  }
  const session = await requireSession();
  if (!session.organizationId) return { status: "error", text: "No organization on this session." };
  if (!hasDatabase()) return { status: "error", text: "The assistant needs a database to run an action." };

  const toolCallId = String(formData.get("toolCallId") ?? "");
  const decision = String(formData.get("decision") ?? "confirm");
  const call = await loadToolCall(session.organizationId, toolCallId);
  if (!call) return { status: "error", text: "That action is no longer available." };
  if (call.status !== "proposed") return { status: "error", text: "That action was already resolved." };

  if (decision === "reject") {
    await resolveToolCall({ organizationId: session.organizationId, toolCallId, status: "rejected" });
    return { status: "answered", threadId: "", text: "Cancelled." };
  }

  const tool = toolByName(call.toolName);
  if (!tool || tool.kind !== "write" || !tool.permission || !can(session.role, tool.permission)) {
    await resolveToolCall({ organizationId: session.organizationId, toolCallId, status: "failed", error: "Not permitted." });
    return { status: "error", text: "You do not have permission to do that." };
  }

  let provider;
  try {
    provider = configuredProvider();
  } catch {
    provider = null;
  }
  if (!provider) return { status: "off", text: OFF };

  const ctx = await loadToolContext(String(formData.get("csrf") ?? "") || null);
  if (!ctx) return { status: "error", text: "Your session ended. Sign in again." };

  const turn = await assistantReply({
    deps: { provider, embedder: null, memory: false, ...tuning() },
    ctx,
    history: [],
    userText: "confirm",
    confirm: { toolName: call.toolName, arguments: call.arguments },
  });

  const auditEventId = await auditToolRun({
    organizationId: session.organizationId,
    actor: actorName(session),
    toolName: call.toolName,
    subjectId: toolCallId,
    detail: turn.text,
  });
  await resolveToolCall({
    organizationId: session.organizationId,
    toolCallId,
    status: turn.text.toLowerCase().includes("could not") || turn.text.toLowerCase().includes("permission") ? "failed" : "ran",
    result: turn.readResults[0]?.result.data ?? turn.text,
    auditEventId,
  });
  const confirmationMessageId = await appendMessage({ organizationId: session.organizationId, threadId: call.threadId, role: "assistant", content: turn.text });
  await indexMessageEmbedding({ organizationId: session.organizationId, threadId: call.threadId, messageId: confirmationMessageId, content: turn.text });
  return { status: "answered", threadId: call.threadId, text: turn.text, route: turn.route };
}

/** Start a fresh thread; returns its id. */
export async function newThreadAction(formData: FormData): Promise<{ threadId: string } | { error: string }> {
  try {
    await assertCsrf(formData);
  } catch {
    return { error: "The form expired. Refresh and try again." };
  }
  const session = await requireSession();
  if (!session.organizationId) return { error: "No organization on this session." };
  const threadId = await createThread({
    organizationId: session.organizationId,
    userId: session.id,
    title: String(formData.get("title") ?? "").trim() || "New conversation",
    entityScope: session.entityScope.join(","),
  });
  return { threadId };
}

/** Archive a thread so it drops off the list. */
export async function archiveThreadAction(formData: FormData): Promise<void> {
  try {
    await assertCsrf(formData);
  } catch (error) {
    fail("/dashboard", error instanceof AuthError ? error.message : "The form expired. Refresh and try again.");
  }
  const session = await requireSession();
  const threadId = String(formData.get("threadId") ?? "");
  const { archiveThread } = await import("@/db/ai");
  if (session.organizationId) await archiveThread(session.organizationId, threadId);
}
