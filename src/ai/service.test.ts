import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./tools/types";
import type { LlmProvider } from "./provider";
import type { EmbeddingProvider } from "./embeddings/provider";

const state = vi.hoisted(() => ({
  memories: [] as { threadId: string; threadTitle: string; messageId: string; role: "user" | "assistant"; content: string; score: number }[],
}));

vi.mock("./retrieval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./retrieval")>()),
  retrieveRelevant: vi.fn(async () => state.memories),
}));
vi.mock("./runtime", () => ({
  runAssistantTurn: vi.fn(async () => ({ text: "Open [Matching](/dashboard/reconciliation) or [Holdings](/dashboard/sources).", readResults: [], status: "answered" })),
}));

import { runAssistantTurn } from "./runtime";
import { assistantReply, toHistory } from "./service";

function context(accountType: "individual" | "organization"): ToolContext {
  return { session: { organizationId: "org_1", accountType }, books: {}, hiddenTabs: [], csrf: "csrf" } as unknown as ToolContext;
}

function reply(accountType: "individual" | "organization") {
  return assistantReply({
    provider: {} as LlmProvider,
    ctx: context(accountType),
    history: [],
    userText: "what next?",
    deps: { provider: {} as LlmProvider, embedder: {} as EmbeddingProvider },
  } as unknown as Parameters<typeof assistantReply>[0]);
}

function memory(content: string, messageId: string) {
  return { threadId: "t", threadTitle: "Earlier", messageId, role: "assistant" as const, content, score: 0.9 };
}

beforeEach(() => {
  vi.mocked(runAssistantTurn).mockClear();
  state.memories = [memory("Open [Matching](/dashboard/reconciliation).", "m1"), memory("Holdings can be exported as a PDF.", "m2")];
});

describe("toHistory", () => {
  const stored = [
    { role: "user", content: "take me to /dashboard/reconciliation" },
    { role: "assistant", content: "Done: [Matching](/dashboard/reconciliation)." },
  ];

  it("keeps stored messages as they were for an organization or an unspecified account", () => {
    expect(toHistory(stored)).toEqual(stored.map((message) => ({ role: message.role, content: message.content })));
    expect(toHistory(stored, "organization")[1]!.content).toContain("/dashboard/reconciliation");
  });

  it("removes links to hidden sections from the assistant's old replies for an individual", () => {
    const history = toHistory(stored, "individual");
    expect(history[1]!.content).not.toContain("reconciliation");
    expect(history[1]!.content).not.toMatch(/matching/i);
    // What the person typed is theirs; it is not rewritten.
    expect(history[0]!.content).toBe(stored[0]!.content);
  });
});

describe("assistantReply memories and reply text", () => {
  it("does not hand an individual's model a memory that names a hidden section", async () => {
    await reply("individual");
    const passed = vi.mocked(runAssistantTurn).mock.calls[0]![0].context ?? "";
    expect(passed).toContain("exported as a PDF");
    expect(passed).not.toMatch(/matching|reconciliation/i);
  });

  it("hands an organization every memory", async () => {
    await reply("organization");
    const passed = vi.mocked(runAssistantTurn).mock.calls[0]![0].context ?? "";
    expect(passed).toContain("exported as a PDF");
    expect(passed).toContain("/dashboard/reconciliation");
  });

  it("strips hidden links from an individual's reply before it is stored, and keeps allowed ones", async () => {
    const turn = await reply("individual");
    expect(turn.text).not.toContain("/dashboard/reconciliation");
    expect(turn.text).toContain("[Holdings](/dashboard/sources)");
  });

  it("leaves an organization's reply as the model wrote it", async () => {
    const turn = await reply("organization");
    expect(turn.text).toContain("[Matching](/dashboard/reconciliation)");
  });
});
