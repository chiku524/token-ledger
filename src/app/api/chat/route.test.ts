import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORG, resetRequest, setHeader, signInDemo, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/availability", () => ({ hasDatabase: () => true }));

vi.mock("@/ai/registry", () => ({
  configuredProvider: vi.fn(() => ({ key: "openai-compatible", descriptor: {}, complete: vi.fn() })),
}));
vi.mock("@/ai/embeddings/config", () => ({ configuredEmbedder: () => null }));
vi.mock("@/ai/context", () => ({
  loadToolContext: async () => ({ session: { organizationId: ORG, role: "owner" }, books: { entities: [] }, hiddenTabs: [], csrf: "c" }),
}));

const replies = vi.hoisted(() => ({ next: {} as unknown }));
vi.mock("@/ai/service", () => ({
  assistantReply: vi.fn(async () => replies.next),
  toHistory: (messages: { role: string; content: string }[]) => messages,
}));

vi.mock("@/db/ai", () => ({
  createThread: vi.fn(async () => "aith_1"),
  loadThread: vi.fn(async () => ({ id: "aith_1" })),
  appendMessage: vi.fn(async () => "aim_1"),
  loadMessages: vi.fn(async () => []),
  recordToolCall: vi.fn(async () => "aitc_1"),
}));

import { POST } from "./route";

const CSRF = "csrf-token-for-tests";
const ORIGIN = "https://ledger.test";

function request(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "ledger.test", ...headers },
    body: JSON.stringify(body),
  });
}

/** Read the NDJSON events from a streaming response. */
async function events(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  resetRequest();
  replies.next = { text: "Opening Matching.", status: "answered", readResults: [], provider: "x" };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/chat", () => {
  it("streams a text event and a done event for an answer", async () => {
    signInLive("owner");
    const response = await POST(request({ message: "hi", csrf: CSRF }));
    expect(response.status).toBe(200);
    const out = await events(response);
    expect(out.some((event) => event.type === "text" && event.delta === "Opening Matching.")).toBe(true);
    expect(out.at(-1)).toMatchObject({ type: "done", threadId: "aith_1", status: "answered" });
  });

  it("streams an awaiting_confirmation event and records the proposal", async () => {
    replies.next = {
      text: "Shall I post it?",
      status: "awaiting_confirmation",
      readResults: [],
      proposal: { tool: "post_journal", arguments: { entityId: "ent_my" }, requiresConfirm: true },
      provider: "x",
    };
    signInLive("accountant");
    const response = await POST(request({ message: "post a journal", csrf: CSRF }));
    const out = await events(response);
    const gate = out.find((event) => event.type === "awaiting_confirmation");
    expect(gate).toMatchObject({ toolCallId: "aitc_1", tool: "post_journal" });
    const db = await import("@/db/ai");
    expect(db.recordToolCall).toHaveBeenCalledWith(expect.objectContaining({ status: "proposed", requiresConfirm: true }));
  });

  it("rejects a stale CSRF token with 403", async () => {
    signInLive("owner");
    const response = await POST(request({ message: "hi", csrf: "wrong" }));
    expect(response.status).toBe(403);
  });

  it("rejects a cross-site origin with 403", async () => {
    signInLive("owner");
    setHeader("origin", "https://evil.example");
    const response = await POST(request({ message: "hi", csrf: CSRF }));
    expect(response.status).toBe(403);
  });

  it("returns 400 for an empty message", async () => {
    signInLive("owner");
    const response = await POST(request({ message: "  ", csrf: CSRF }));
    expect(response.status).toBe(400);
  });

  it("returns 503 when no provider is configured", async () => {
    const registry = await import("@/ai/registry");
    vi.mocked(registry.configuredProvider).mockReturnValueOnce(null);
    signInLive("owner");
    const response = await POST(request({ message: "hi", csrf: CSRF }));
    expect(response.status).toBe(503);
  });

  it("redirects (401/redirect) when there is no session", async () => {
    resetRequest();
    await expect(POST(request({ message: "hi", csrf: CSRF }))).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("returns 400 for a non-JSON body", async () => {
    signInLive("owner");
    const response = await POST(
      new Request(`${ORIGIN}/api/chat`, { method: "POST", headers: { origin: ORIGIN, host: "ledger.test" }, body: "not json" }),
    );
    expect(response.status).toBe(400);
  });
});

void signInDemo;
