"use client";

/**
 * The assistant runtime provider. It wraps the dashboard chat panel in an
 * assistant-ui `LocalRuntime` whose model adapter talks to our `/api/chat` route
 * (see `chat-adapter.ts`). Our backend stays authoritative: the runtime only
 * supplies presentation and, for a write, the approval gate the user decides.
 */
import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AssistantRuntimeProvider, useLocalRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { createChatAdapter } from "./chat-adapter";
import { confirmToolCallAction } from "@/app/dashboard/chat-actions";

export interface ChatRuntimeProviderProps {
  children: ReactNode;
  csrf: string;
  /** Whether retrieval (RAG) is on for this deployment. */
  memory?: boolean;
}

/** A mutable holder the adapter reads at call-time; not a React ref, so it is safe to close over. */
interface ThreadIdHolder {
  current: string | null;
}

export function ChatRuntimeProvider({ children, csrf, memory = true }: ChatRuntimeProviderProps) {
  const router = useRouter();

  const adapter = useMemo(() => {
    const threadIdRef: ThreadIdHolder = { current: null };
    return createChatAdapter(
      {
        csrf,
        memory,
        onNavigate: (route) => {
          if (route && route.startsWith("/dashboard")) router.push(route);
        },
        onThreadId: (threadId) => {
          threadIdRef.current = threadId;
        },
        onConfirm: async ({ toolCallId, decision }) => {
          const form = new FormData();
          form.set("csrf", csrf);
          form.set("toolCallId", toolCallId);
          form.set("decision", decision);
          const result = await confirmToolCallAction(form);
          if (result.status === "answered" || result.status === "refused") {
            return { text: result.text, route: "route" in result ? result.route : undefined };
          }
          return { text: result.text };
        },
      },
      threadIdRef,
    );
  }, [csrf, memory, router]);

  const runtime = useLocalRuntime(adapter, {
    // A write pauses on an approval gate; the run resumes once decided. Cap the
    // sequential tool rounds so a looping model cannot spin.
    maxSteps: 6,
    initialMessages: [] as readonly ThreadMessageLike[],
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
