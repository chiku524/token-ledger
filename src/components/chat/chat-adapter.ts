"use client";

/**
 * Maps the Token Ledger `/api/chat` NDJSON stream onto an assistant-ui
 * `ChatModelAdapter`.
 *
 * Our backend is authoritative: it runs the tool loop, decides a write needs a
 * confirmation, and only executes one when the user confirms. assistant-ui owns
 * the presentation. The adapter translates in both directions:
 *
 * - A read turn streams to a text reply.
 * - A write turn arrives as `awaiting_confirmation`; the adapter emits a
 *   tool-call part carrying an `approval` gate, which is exactly assistant-ui's
 *   model for "ask the user to allow or block an action". When every gate is
 *   decided the runtime calls the adapter again; the adapter reads the decision
 *   and posts it to our confirm action, which is the only thing that runs the
 *   write. See docs/adr-ai-assistant.md.
 */
import type { ChatModelAdapter, ThreadMessageLike } from "@assistant-ui/react";
import type { ThreadAssistantMessagePart } from "@assistant-ui/react";

/** One NDJSON event emitted by the route. Mirrors `src/app/api/chat/route.ts`. */
type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; status: string; summary?: string; route?: string }
  | { type: "awaiting_confirmation"; toolCallId: string; tool: string; route?: string }
  | { type: "done"; threadId: string; status: string }
  | { type: "error"; message: string };

export interface ChatAdapterDeps {
  csrf: string;
  /** Called with a route the assistant decided to open. */
  onNavigate?: (route: string) => void;
  /** Called with the active thread id once the backend assigns one. */
  onThreadId?: (threadId: string) => void;
  /** Confirms or rejects a proposed write; returns the result text. */
  onConfirm: (input: { toolCallId: string; decision: "confirm" | "reject" }) => Promise<{ text: string; route?: string }>;
  /** Whether to send retrieved memories with the turn. */
  memory?: boolean;
}

/** Human-readable label for a tool card. Mirrors the tool registry. */
const TOOL_LABELS: Record<string, string> = {
  navigate: "Open page",
  list_entities: "List companies",
  list_holdings: "List holdings",
  list_journal: "List journal",
  list_reconciliation: "List exceptions",
  list_connections: "List connections",
  list_audit_events: "List history",
  post_journal: "Post journal",
  reverse_journal: "Reverse journal",
  match_reconciliation: "Match movement",
  unmatch_reconciliation: "Unmatch movement",
  close_period: "Close period",
  prepare_billing_vault: "Prepare billing vault",
  prepare_billing_deposit: "Prepare billing deposit",
  prepare_billing_withdraw: "Prepare billing withdrawal",
  prepare_billing_revoke: "Prepare billing revocation",
  prepare_treasury_payment: "Prepare treasury payment",
  prepare_treasury_execute: "Prepare treasury execution",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

/** Flatten the assistant-ui message history to the neutral shape our route reads. */
function historyFromMessages(messages: readonly ThreadMessageLike[]): { role: string; content: string }[] {
  return messages.flatMap((message) => {
    const text = typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part) => part.type === "text")
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");
    if (!text.trim()) return [];
    return [{ role: message.role, content: text }];
  });
}

/**
 * The slice of a tool-call part we read a decision from. Both the user and
 * assistant part unions carry a tool-call variant with these fields, so a
 * structural read avoids narrowing the whole union.
 */
interface ApprovalBearingPart {
  type: string;
  toolCallId?: string;
  approval?: {
    approved?: boolean;
    resolution?: "cancelled" | "expired";
  };
}

/**
 * Read the decisions the user recorded on an approval gate from the in-progress
 * assistant message. Returns the tool calls that were allowed or denied.
 */
function readApprovalDecisions(message: { content: readonly unknown[] }): {
  toolCallId: string;
  approved: boolean;
}[] {
  return (message.content as readonly ApprovalBearingPart[]).flatMap((part) =>
    part.type === "tool-call" && part.approval?.approved !== undefined && !part.approval.resolution
      ? [{ toolCallId: part.toolCallId ?? "", approved: part.approval.approved }]
      : [],
  );
}

export function createChatAdapter(deps: ChatAdapterDeps, threadIdRef: { current: string | null }): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal, unstable_threadId, unstable_getMessage }) {
      // A resumed run: the user answered a gate. There is no new user message;
      // read the decisions and post them. This is the only path that runs a write.
      const decisions = readApprovalDecisions(unstable_getMessage());
      if (decisions.length > 0) {
        const parts: ThreadAssistantMessagePart[] = [];
        let text = "";
        for (const decision of decisions) {
          const result = await deps.onConfirm({
            toolCallId: decision.toolCallId,
            decision: decision.approved ? "confirm" : "reject",
          });
          text = result.text;
          if (result.route) deps.onNavigate?.(result.route);
          parts.push({
            type: "tool-call",
            toolCallId: decision.toolCallId,
            toolName: "decision",
            args: { approved: decision.approved },
            argsText: JSON.stringify({ approved: decision.approved }),
            approval: { id: decision.toolCallId, approved: decision.approved },
            result: { text: result.text },
          });
        }
        yield {
          content: [...parts, ...(text ? [{ type: "text" as const, text }] : [])],
        };
        return;
      }

      const history = historyFromMessages(messages);
      const userText = history.at(-1)?.content ?? "";
      const threadId = unstable_threadId ?? threadIdRef.current ?? undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: userText,
          threadId,
          csrf: deps.csrf,
          memory: deps.memory === false ? "off" : "on",
          history: history.slice(0, -1),
        }),
        signal: abortSignal,
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `The assistant is unavailable (${response.status}).`);
      }

      const toolParts = new Map<string, ThreadAssistantMessagePart>();
      let text = "";

      for await (const event of readNdjson(response.body, abortSignal)) {
        switch (event.type) {
          case "text":
            text += event.delta;
            break;
          case "tool": {
            // A read tool ran; show it as a settled card. Navigation routes the app.
            if (event.route && event.tool === "navigate") deps.onNavigate?.(event.route);
            toolParts.set(`${event.tool}:${toolParts.size}`, {
              type: "tool-call",
              toolCallId: `read_${toolParts.size}`,
              toolName: event.tool,
              args: {},
              argsText: "{}",
              result: { summary: event.summary ?? "", route: event.route ?? null },
            });
            break;
          }
          case "awaiting_confirmation":
            // A write needs a decision. Emit an approval gate; the run pauses.
            toolParts.set(event.toolCallId, {
              type: "tool-call",
              toolCallId: event.toolCallId,
              toolName: event.tool,
              args: {},
              argsText: "{}",
              approval: { id: event.toolCallId },
            });
            break;
          case "done":
            deps.onThreadId?.(event.threadId);
            threadIdRef.current = event.threadId;
            break;
          case "error":
            throw new Error(event.message);
        }

        yield {
          content: [
            ...Array.from(toolParts.values()),
            ...(text ? [{ type: "text" as const, text }] : []),
          ],
        };
      }

      // If a gate was opened, hold the run so the user can decide.
      const hasGate = Array.from(toolParts.values()).some((part) => part.type === "tool-call" && part.approval);
      if (hasGate) {
        yield {
          content: [
            ...Array.from(toolParts.values()),
            ...(text ? [{ type: "text" as const, text }] : []),
          ],
          status: { type: "requires-action", reason: "tool-calls" },
        };
      }
    },
  };
}

/** Parse a newline-delimited JSON stream, skipping a partial final line. */
async function* readNdjson(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          try {
            yield JSON.parse(line) as ChatEvent;
          } catch {
            // A malformed line is skipped; the stream stays usable.
          }
        }
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        yield JSON.parse(tail) as ChatEvent;
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}
