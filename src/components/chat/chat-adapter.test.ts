import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatAdapter, toolLabel, type ChatAdapterDeps } from "./chat-adapter";
import type { ChatModelRunOptions } from "@assistant-ui/react";

/** Build an NDJSON Response from a list of events. */
function ndjsonResponse(events: unknown[]): Response {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function deps(overrides: Partial<ChatAdapterDeps> = {}): ChatAdapterDeps {
  return {
    csrf: "csrf",
    onConfirm: vi.fn(async () => ({ text: "Posted JE-1.", route: "/dashboard/ledger" })),
    ...overrides,
  };
}

/** Minimal run options the adapter reads. */
function runOptions(overrides: Partial<ChatModelRunOptions> = {}): ChatModelRunOptions {
  return {
    messages: [{ role: "user", content: [{ type: "text", text: "open matching" }] }],
    runConfig: {},
    abortSignal: new AbortController().signal,
    context: {} as ChatModelRunOptions["context"],
    unstable_getMessage: () => ({ content: [] }),
    ...overrides,
  } as ChatModelRunOptions;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("toolLabel", () => {
  it("uses known labels and falls back to the raw name", () => {
    expect(toolLabel("navigate")).toBe("Open page");
    expect(toolLabel("post_journal")).toBe("Post journal");
    expect(toolLabel("unknown_tool")).toBe("unknown tool");
  });
});

describe("createChatAdapter — a read turn", () => {
  it("streams text and tool cards and routes a navigation result", async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonResponse([
          { type: "tool", tool: "navigate", status: "ran", summary: "Opening Matching.", route: "/dashboard/reconciliation" },
          { type: "text", delta: "Opening Matching." },
          { type: "done", threadId: "aith_1", status: "answered" },
        ]),
      ),
    );
    const threadRef = { current: null as string | null };
    const adapter = createChatAdapter(deps({ onNavigate: navigate }), threadRef);

    const run = adapter.run(runOptions());
    const results = [];
    for await (const update of run as AsyncGenerator<{ content: readonly { type: string }[] }>) results.push(update);

    const last = results.at(-1)!;
    expect(navigate).toHaveBeenCalledWith("/dashboard/reconciliation");
    expect(threadRef.current).toBe("aith_1");
    // A tool card and a text part are present.
    expect(last.content.some((part) => part.type === "tool-call")).toBe(true);
    expect(last.content.some((part) => part.type === "text")).toBe(true);
  });

  it("sends the history and the csrf token to the route", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ndjsonResponse([{ type: "text", delta: "ok" }, { type: "done", threadId: "t", status: "answered" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createChatAdapter(deps(), { current: null });
    for await (const _ of adapter.run(runOptions()) as AsyncGenerator<unknown>) void _;
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.message).toBe("open matching");
    expect(body.csrf).toBe("csrf");
  });
});

describe("createChatAdapter — a write turn", () => {
  it("emits a pending approval gate and pauses the run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonResponse([
          { type: "text", delta: "Shall I post it?" },
          { type: "awaiting_confirmation", toolCallId: "aitc_1", tool: "post_journal", route: "/dashboard/ledger" },
          { type: "done", threadId: "aith_1", status: "awaiting_confirmation" },
        ]),
      ),
    );
    const adapter = createChatAdapter(deps(), { current: null });
    const run = adapter.run(runOptions());
    const results = [];
    for await (const update of run as AsyncGenerator<{ content: readonly unknown[]; status?: { type: string } }>) results.push(update);

    const last = results.at(-1)!;
    const gate = (last.content as { type: string; approval?: { id: string } }[]).find((part) => part.type === "tool-call");
    expect(gate?.approval?.id).toBe("aitc_1");
    expect(last.status).toEqual({ type: "requires-action", reason: "tool-calls" });
  });

  it("runs the confirm action when a decision is recorded", async () => {
    const onConfirm = vi.fn(async () => ({ text: "Posted JE-1.", route: "/dashboard/ledger" }));
    const navigate = vi.fn();
    const adapter = createChatAdapter(deps({ onConfirm, onNavigate: navigate }), { current: null });
    const message = {
      content: [{ type: "tool-call", toolCallId: "aitc_1", toolName: "post_journal", args: {}, approval: { id: "aitc_1", approved: true } }],
    };
    const run = adapter.run(runOptions({ unstable_getMessage: () => message as never }));
    const results = [];
    for await (const update of run as AsyncGenerator<{ content: readonly { type: string }[] }>) results.push(update);

    expect(onConfirm).toHaveBeenCalledWith({ toolCallId: "aitc_1", decision: "confirm" });
    expect(navigate).toHaveBeenCalledWith("/dashboard/ledger");
    expect(results.at(-1)!.content.some((part) => part.type === "text")).toBe(true);
  });

  it("posts reject for a denied gate and never confirms", async () => {
    const onConfirm = vi.fn(async () => ({ text: "Cancelled." }));
    const adapter = createChatAdapter(deps({ onConfirm }), { current: null });
    const message = {
      content: [{ type: "tool-call", toolCallId: "aitc_2", toolName: "post_journal", args: {}, approval: { id: "aitc_2", approved: false } }],
    };
    for await (const _ of adapter.run(runOptions({ unstable_getMessage: () => message as never })) as AsyncGenerator<unknown>) void _;
    expect(onConfirm).toHaveBeenCalledWith({ toolCallId: "aitc_2", decision: "reject" });
  });

  it("does not read a resolved gate as a new decision", async () => {
    const onConfirm = vi.fn(async () => ({ text: "x" }));
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([{ type: "text", delta: "hi" }, { type: "done", threadId: "t", status: "answered" }])));
    const adapter = createChatAdapter(deps({ onConfirm }), { current: null });
    const message = {
      content: [{ type: "tool-call", toolCallId: "aitc_3", toolName: "post_journal", args: {}, approval: { id: "aitc_3", approved: true, resolution: "cancelled" } }],
    };
    for await (const _ of adapter.run(runOptions({ unstable_getMessage: () => message as never })) as AsyncGenerator<unknown>) void _;
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("createChatAdapter — errors", () => {
  it("throws a readable error on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "The assistant is not configured." }, { status: 503 })));
    const adapter = createChatAdapter(deps(), { current: null });
    await expect(async () => {
      for await (const _ of adapter.run(runOptions()) as AsyncGenerator<unknown>) void _;
    }).rejects.toThrow(/not configured/i);
  });

  it("surfaces an in-stream error event", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([{ type: "error", message: "The assistant failed." }])));
    const adapter = createChatAdapter(deps(), { current: null });
    await expect(async () => {
      for await (const _ of adapter.run(runOptions()) as AsyncGenerator<unknown>) void _;
    }).rejects.toThrow(/failed/i);
  });
});
