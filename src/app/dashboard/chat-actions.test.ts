import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CROSS_SITE,
  form,
  FORM_EXPIRED,
  ORG,
  resetRequest,
  setHeader,
  signInDemo,
  signInLive,
} from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

vi.mock("@/db/availability", () => ({ hasDatabase: () => true }));

vi.mock("@/ai/registry", () => ({
  configuredProvider: () => ({ key: "ollama", descriptor: {}, complete: vi.fn() }),
}));
vi.mock("@/ai/config", () => ({ aiConfig: () => ({ provider: "ollama", model: "llama3.1" }) }));
vi.mock("@/ai/embeddings/config", () => ({ configuredEmbedder: () => null }));
vi.mock("@/ai/context", () => ({
  loadToolContext: async (csrf: string | null) => ({ session: current(), books: { entities: [] }, hiddenTabs: [], csrf }),
}));
vi.mock("@/ai/service", () => ({
  assistantReply: vi.fn(async () => ({ text: "Here is the answer.", status: "answered", readResults: [], provider: "ollama" })),
  toHistory: (messages: { role: string; content: string }[]) => messages,
}));

const aiDb = vi.hoisted(() => ({
  threads: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  toolCalls: [] as Record<string, unknown>[],
}));
vi.mock("@/db/ai", () => ({
  createThread: vi.fn(async (input: Record<string, unknown>) => {
    const id = "aith_1";
    aiDb.threads.push({ id, ...input, archived: false });
    return id;
  }),
  loadThread: vi.fn(async (_org: string, _user: string, id: string) => aiDb.threads.find((thread) => thread.id === id) ?? null),
  appendMessage: vi.fn(async (input: Record<string, unknown>) => {
    const id = `aim_${aiDb.messages.length + 1}`;
    aiDb.messages.push({ id, ...input });
    return id;
  }),
  loadMessages: vi.fn(async () => []),
  recordToolCall: vi.fn(async (input: Record<string, unknown>) => {
    const id = "aitc_1";
    aiDb.toolCalls.push({ id, ...input });
    return id;
  }),
  loadToolCall: vi.fn(async () => aiDb.toolCalls[0] ?? null),
  resolveToolCall: vi.fn(async () => undefined),
  auditToolRun: vi.fn(async () => "audit_1"),
  archiveThread: vi.fn(async () => undefined),
}));

const currentSession = (): { role: string; organizationId: string; entityScope: string[]; name: string; email: string; id: string; demo: boolean } => ({
  id: "user_owner",
  organizationId: ORG,
  entityScope: [],
  name: "Owner",
  email: "owner@harbourline.example",
  role: "owner",
  demo: true,
});

// `@/auth/current` is real; the harness drives the session through cookies.

import { sendMessageAction, confirmToolCallAction, newThreadAction, archiveThreadAction } from "./chat-actions";

const current = () => currentSession();

beforeEach(() => {
  resetRequest();
  aiDb.threads = [];
  aiDb.messages = [];
  aiDb.toolCalls = [];
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("sendMessageAction", () => {
  it("answers a read turn and persists the messages", async () => {
    signInDemo("owner");
    const result = await sendMessageAction(form({ message: "summarize the books" }));
    expect(result).toMatchObject({ status: "answered", text: "Here is the answer." });
    expect(aiDb.messages.some((message) => message.role === "user")).toBe(true);
    expect(aiDb.messages.some((message) => message.role === "assistant")).toBe(true);
  });

  it("rejects a stale CSRF token", async () => {
    signInDemo("owner");
    const result = await sendMessageAction(form({ message: "hi" }, { csrf: "wrong" }));
    expect(result.status).toBe("error");
    expect(result.text).toContain("form expired");
  });

  it("blocks a cross-site origin", async () => {
    signInDemo("owner");
    setHeader("origin", "https://evil.example");
    const result = await sendMessageAction(form({ message: "hi" }));
    expect(result.status).toBe("error");
    expect(result.text).toContain("Cross-site");
  });

  it("requires a signed-in session", async () => {
    resetRequest();
    await expect(sendMessageAction(form({ message: "hi" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("reports the assistant off when no provider is configured", async () => {
    const registry = await import("@/ai/registry");
    vi.spyOn(registry, "configuredProvider").mockReturnValueOnce(null);
    signInDemo("owner");
    const result = await sendMessageAction(form({ message: "hi" }));
    expect(result.status).toBe("off");
  });

  it("rejects an empty message", async () => {
    signInDemo("owner");
    const result = await sendMessageAction(form({ message: "  " }));
    expect(result.status).toBe("error");
  });

  it("records a proposal and waits for confirmation on a write", async () => {
    const service = await import("@/ai/service");
    vi.spyOn(service, "assistantReply").mockResolvedValueOnce({
      text: "Shall I post it?",
      status: "awaiting_confirmation",
      readResults: [],
      proposal: { tool: "post_journal", arguments: { entityId: "ent_my" }, requiresConfirm: true },
    });
    signInDemo("accountant");
    const result = await sendMessageAction(form({ message: "post a journal" }));
    expect(result.status).toBe("awaiting_confirmation");
    expect(aiDb.toolCalls[0]).toMatchObject({ toolName: "post_journal", status: "proposed" });
  });
});

describe("confirmToolCallAction", () => {
  it("runs a proposed write and audits it", async () => {
    aiDb.toolCalls.push({ id: "aitc_1", threadId: "aith_1", toolName: "post_journal", arguments: {}, status: "proposed", requiresConfirm: true });
    signInLive("accountant");
    const result = await confirmToolCallAction(form({ toolCallId: "aitc_1", decision: "confirm" }));
    expect(result.status).toBe("answered");
  });

  it("rejects a proposed write without running it", async () => {
    aiDb.toolCalls.push({ id: "aitc_1", threadId: "aith_1", toolName: "post_journal", arguments: {}, status: "proposed", requiresConfirm: true });
    signInLive("accountant");
    const result = await confirmToolCallAction(form({ toolCallId: "aitc_1", decision: "reject" }));
    expect(result.text).toBe("Cancelled.");
    const db = await import("@/db/ai");
    expect(db.resolveToolCall).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
  });

  it("refuses to resolve a call that is not proposed", async () => {
    aiDb.toolCalls.push({ id: "aitc_1", threadId: "aith_1", toolName: "post_journal", arguments: {}, status: "ran", requiresConfirm: true });
    signInLive("accountant");
    const result = await confirmToolCallAction(form({ toolCallId: "aitc_1", decision: "confirm" }));
    expect(result.status).toBe("error");
  });
});

describe("thread actions", () => {
  it("creates a new thread", async () => {
    signInLive("owner");
    const result = await newThreadAction(form({ title: "Tax question" }));
    expect(result).toMatchObject({ threadId: "aith_1" });
  });

  it("archives a thread", async () => {
    signInLive("owner");
    await archiveThreadAction(form({ threadId: "aith_1" }));
    const db = await import("@/db/ai");
    expect(db.archiveThread).toHaveBeenCalledWith(ORG, "aith_1");
  });
});

void CROSS_SITE;
void FORM_EXPIRED;
