/**
 * The assistant streaming route. `POST` resolves the session and CSRF exactly
 * like a dashboard action, runs one turn, and streams typed events as
 * newline-delimited JSON (NDJSON) so the panel can render text and tool
 * activity as they arrive.
 *
 * When the assistant is not configured the route returns a clear 503 with the
 * reason, matching the "features off" contract of `solanaDeployment()`.
 */
import { assertCsrf, AuthError, requireSession } from "@/auth/current";
import { can } from "@/auth/roles";
import { configuredEmbedder } from "@/ai/embeddings/config";
import { providerForOrganization } from "@/ai/settings";
import { indexMessageEmbedding } from "@/ai/embeddings/index-message";
import { assistantReply, toHistory } from "@/ai/service";
import { loadToolContext } from "@/ai/context";
import { appendMessage, createThread, loadMessages, loadThread, recordToolCall } from "@/db/ai";
import { hasDatabase } from "@/db/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; status: string; summary?: string; route?: string }
  | { type: "awaiting_confirmation"; toolCallId: string; tool: string; route?: string; preview?: unknown }
  | { type: "done"; threadId: string; status: string }
  | { type: "error"; message: string };

function titleFrom(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || "New conversation";
}

export async function POST(request: Request): Promise<Response> {
  let body: { message?: string; threadId?: string; csrf?: string; memory?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // Reuse the form guard by shaping the payload into FormData (origin is checked
  // against the request host, and the CSRF token must match the cookie).
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) formData.set(key, String(value));
  }
  try {
    await assertCsrf(formData);
  } catch (error) {
    return Response.json({ error: error instanceof AuthError ? error.message : "The request was blocked." }, { status: 403 });
  }

  const session = await requireSession();
  if (!can(session.role, "books.read")) return Response.json({ error: "You do not have permission to use the assistant." }, { status: 403 });
  if (!hasDatabase()) return Response.json({ error: "The assistant needs a database." }, { status: 503 });
  if (!session.organizationId) return Response.json({ error: "No organization on this session." }, { status: 400 });

  let resolved;
  try {
    resolved = await providerForOrganization(session.organizationId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Assistant misconfigured." }, { status: 500 });
  }
  if (!resolved) return Response.json({ error: "The assistant is not configured." }, { status: 503 });
  const provider = resolved.provider;
  const providerConfig = resolved.config;

  const userText = (body.message ?? "").trim();
  if (!userText) return Response.json({ error: "Type a message." }, { status: 400 });

  const existing = body.threadId ? await loadThread(session.organizationId, session.id, body.threadId) : null;
  const threadId = existing?.id ?? (await createThread({
    organizationId: session.organizationId,
    userId: session.id,
    title: titleFrom(userText),
    entityScope: session.entityScope.join(","),
  }));
  const userMessageId = await appendMessage({ organizationId: session.organizationId, threadId, role: "user", content: userText });
  // Embed the user turn now so it is retrievable immediately (awaited, not
  // detached: a Worker may cancel a detached promise when the response ends).
  await indexMessageEmbedding({ organizationId: session.organizationId, threadId, messageId: userMessageId, content: userText });
  const ctx = await loadToolContext(session.demo ? null : (body.csrf ?? null));
  if (!ctx) return Response.json({ error: "Your session ended." }, { status: 401 });

  const historyRows = await loadMessages(session.organizationId, threadId);
  const history = toHistory(historyRows.slice(0, -1));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const turn = await assistantReply({
          deps: { provider, embedder: configuredEmbedder(), memory: body.memory !== "off", excludeMessageId: userMessageId, temperature: providerConfig.temperature, maxTokens: providerConfig.maxTokens },
          ctx,
          history,
          userText,
        });
        if (turn.text) send({ type: "text", delta: turn.text });
        for (const read of turn.readResults) {
          send({ type: "tool", tool: read.tool, status: "ran", summary: read.result.summary, route: read.result.route });
        }

        const assistantMessageId = await appendMessage({
          organizationId: session.organizationId,
          threadId,
          role: "assistant",
          content: turn.text,
          provider: turn.provider ?? null,
          model: turn.model ?? null,
          inputTokens: turn.usage?.inputTokens ?? null,
          outputTokens: turn.usage?.outputTokens ?? null,
        });
        await indexMessageEmbedding({ organizationId: session.organizationId, threadId, messageId: assistantMessageId, content: turn.text });

        if (turn.status === "awaiting_confirmation" && turn.proposal) {
          const toolCallId = await recordToolCall({
            organizationId: session.organizationId,
            threadId,
            messageId: assistantMessageId,
            toolName: turn.proposal.tool,
            args: turn.proposal.arguments,
            status: "proposed",
            requiresConfirm: true,
          });
          send({ type: "awaiting_confirmation", toolCallId, tool: turn.proposal.tool, route: turn.route, preview: turn.proposal.preview });
        }
        send({ type: "done", threadId, status: turn.status });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "The assistant failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
