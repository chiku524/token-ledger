"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowUp, History, MessageSquare, Mic, PanelRightClose, Plus, Sparkles, Square, Volume2 } from "lucide-react";
import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ThreadMessageLike,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatToolCard } from "./chat-tool-card";
import { ChatRuntimeProvider } from "./chat-runtime-provider";
import { ModelSelector } from "./model-selector";
import {
  listThreadsAction,
  loadThreadMessagesAction,
  type ChatThreadSummary,
} from "@/app/dashboard/chat-actions";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Starter prompts, matching docs/ai-chatbot.md §6. */
const STARTERS = [
  "Open matching",
  "Summarize the books this month",
  "Show unmatched movements this week",
  "Why is this connection still Waiting?",
] as const;

/** Register our one tool renderer under the fallback slot. */
const toolComponents = { Fallback: ChatToolCard as ToolCallMessagePartComponent };

function AssistantMark() {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Sparkles className="size-3.5" aria-hidden />
    </span>
  );
}

function UserMark() {
  return (
    <span className="label-caps flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      You
    </span>
  );
}

function ChatThread({ speech }: { speech: boolean }) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto px-4 py-4">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8 text-center">
            <AssistantMark />
            <p className="font-heading text-base font-medium text-foreground">Token Ledger assistant</p>
            <p className="text-sm text-muted-foreground">
              Ask about the books, or tell me what to do — I&apos;ll open the page or prepare the entry for your
              confirmation.
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {STARTERS.map((prompt) => (
                <ThreadPrimitive.Suggestion
                  key={prompt}
                  prompt={prompt}
                  send
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {prompt}
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === "user" ? (
              <MessagePrimitive.Root className="mb-4 flex items-start justify-end gap-2">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  <MessagePrimitive.Parts
                    components={{ Text: ({ text }) => <p className="whitespace-pre-wrap">{text}</p> }}
                  />
                </div>
                <UserMark />
              </MessagePrimitive.Root>
            ) : (
              <MessagePrimitive.Root className="mb-4 flex items-start gap-2">
                <AssistantMark />
                <div className="min-w-0 max-w-[85%] text-sm text-foreground">
                  <MessagePrimitive.Parts
                    components={{
                      Text: ({ text }) => <p className="whitespace-pre-wrap leading-relaxed">{text}</p>,
                      tools: toolComponents,
                    }}
                  />
                  {speech ? (
                    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="mt-2 flex items-center gap-1.5">
                      <ActionBarPrimitive.Speak asChild>
                        <Button variant="success" size="sm" className="gap-1.5 px-3 font-medium" aria-label="Read aloud">
                          <Volume2 className="size-4" aria-hidden />
                          Read aloud
                        </Button>
                      </ActionBarPrimitive.Speak>
                      <ActionBarPrimitive.StopSpeaking asChild>
                        <Button variant="secondary" size="sm" className="gap-1.5 px-2.5" aria-label="Stop reading">
                          <Square className="size-3.5" aria-hidden />
                          Stop
                        </Button>
                      </ActionBarPrimitive.StopSpeaking>
                    </ActionBarPrimitive.Root>
                  ) : null}
                </div>
              </MessagePrimitive.Root>
            )
          }
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ScrollToBottom className="sticky bottom-2 z-10 mx-auto flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm disabled:hidden">
          <ArrowUp className="size-4" aria-hidden />
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <ComposerPrimitive.Input
            placeholder="Ask, or tell me what to do…"
            submitMode="enter"
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <ComposerPrimitive.Dictate asChild>
            <Button variant="ghost" size="icon" aria-label="Dictate with your voice">
              <Mic className="size-4" aria-hidden />
            </Button>
          </ComposerPrimitive.Dictate>
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <Button size="icon" aria-label="Send">
                <ArrowUp className="size-4" aria-hidden />
              </Button>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button size="icon" variant="secondary" aria-label="Stop">
                <Square className="size-3.5" aria-hidden />
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

/** The history list: pick a past conversation, or start a new one. */
function HistoryList({
  threads,
  activeId,
  onPick,
  onNew,
}: {
  threads: ChatThreadSummary[];
  activeId: string | null;
  onPick: (thread: ChatThreadSummary) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <Button variant="secondary" className="mb-3 justify-start" onClick={onNew}>
        <Plus className="size-4" aria-hidden />
        New conversation
      </Button>
      {threads.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No conversations yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onPick(thread)}
                className={cn(
                  "w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  thread.id === activeId ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {thread.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ChatPanelProps {
  csrf: string;
  /** Whether a provider is configured; when false the panel explains it is off. */
  enabled?: boolean;
  memory?: boolean;
  /** Whether text-to-speech (ElevenLabs) is on for this deployment. */
  speech?: boolean;
  /** Whether this session may switch provider/model (owner or admin). */
  canManageAi?: boolean;
}

/** Shown when no provider is configured, so the launcher never errors. */
function AssistantOff() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <AssistantMark />
      <p className="font-heading text-base font-medium">The assistant is not configured</p>
      <p className="text-sm text-muted-foreground">
        Set <code className="font-mono text-xs">AI_PROVIDER</code> on the server to turn it on. Everything else keeps
        working.
      </p>
    </div>
  );
}

/**
 * The assistant launcher and panel. It is available on every dashboard page
 * (mounted from the shell). On a small screen it is a bottom-right floating
 * window; on `lg` and up it docks as a right-hand sidebar. Motion is
 * opacity/transform only and respects reduced motion via the app's MotionConfig.
 *
 * The panel restores the user's history from our store (AI-07) and offers a
 * thread list and a new conversation. Switching threads remounts the runtime via
 * a key so a conversation swaps cleanly.
 */
export function ChatPanel({ csrf, enabled = true, memory = true, speech = false, canManageAi = false }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<readonly ThreadMessageLike[]>([]);
  const [ready, setReady] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // On first open, load the latest thread and its messages so history persists.
  useEffect(() => {
    if (!open || ready || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listThreadsAction();
        if (cancelled) return;
        setThreads(list);
        const latest = list[0];
        if (latest) {
          const messages = await loadThreadMessagesAction(latest.id);
          if (cancelled) return;
          setActiveThreadId(latest.id);
          setInitialMessages(
            messages.map((message) => ({
              role: message.role,
              content: [{ type: "text" as const, text: message.content }],
              createdAt: new Date(message.createdAt),
            })),
          );
        }
      } catch {
        // History is best-effort; a failure just starts a fresh conversation.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ready, enabled]);

  const switchTo = useCallback(async (thread: ChatThreadSummary | null) => {
    if (!thread) {
      setActiveThreadId(null);
      setInitialMessages([]);
      setShowHistory(false);
      return;
    }
    const messages = await loadThreadMessagesAction(thread.id);
    setActiveThreadId(thread.id);
    setInitialMessages(
      messages.map((message) => ({
        role: message.role,
        content: [{ type: "text" as const, text: message.content }],
        createdAt: new Date(message.createdAt),
      })),
    );
    setShowHistory(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      // A focus trap, so Tab cycles within the panel while it is open.
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = (
    <m.aside
      ref={panelRef}
      key="panel"
      role="dialog"
      aria-modal="true"
      aria-label="Token Ledger assistant"
      data-print="hide"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden border border-border bg-popover shadow-xl",
        // Small screens: a floating window above the launcher.
        "inset-x-3 bottom-3 top-20 rounded-2xl",
        // Large screens: a docked right sidebar, full height.
        "lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[26rem] lg:max-w-[92vw] lg:rounded-none lg:border-y-0 lg:border-r-0",
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <AssistantMark />
          <span className="font-heading text-sm font-medium">Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {enabled && canManageAi ? <ModelSelector csrf={csrf} /> : null}
          {enabled ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={showHistory ? "Back to chat" : "Show conversations"}
              aria-pressed={showHistory}
              onClick={() => setShowHistory((value) => !value)}
            >
              <History className="size-4" aria-hidden />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" onClick={() => setOpen(false)}>
            <PanelRightClose className="size-4" aria-hidden />
          </Button>
        </div>
      </header>
      {!enabled ? (
        <AssistantOff />
      ) : showHistory ? (
        <HistoryList
          threads={threads}
          activeId={activeThreadId}
          onPick={(thread) => void switchTo(thread)}
          onNew={() => void switchTo(null)}
        />
      ) : (
        <ChatRuntimeProvider
          key={activeThreadId ?? "new"}
          csrf={csrf}
          memory={memory}
          speech={speech}
          initialThreadId={activeThreadId}
          initialMessages={initialMessages}
        >
          <ChatThread speech={speech} />
        </ChatRuntimeProvider>
      )}
    </m.aside>
  );

  return (
    <AnimatePresence>
      {!open ? (
        <m.button
          key="launcher"
          type="button"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: EASE }}
          aria-label="Open the assistant"
          data-print="hide"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 md:right-6 md:bottom-6"
        >
          <MessageSquare className="size-4" aria-hidden />
          Assistant
        </m.button>
      ) : (
        panel
      )}
    </AnimatePresence>
  );
}
