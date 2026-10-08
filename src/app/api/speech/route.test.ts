import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequest, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

const speech = vi.hoisted(() => ({ configured: true, bytes: 4, error: null as Error | null }));
vi.mock("@/ai/speech/config", () => ({ speechConfigured: () => speech.configured }));
vi.mock("@/ai/speech/synthesize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/speech/synthesize")>();
  return {
    ...actual,
    synthesizeSpeech: vi.fn(async () => {
      if (speech.error) throw speech.error;
      return new Uint8Array(speech.bytes);
    }),
  };
});

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("https://ledger.test/api/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRequest();
  speech.configured = true;
  speech.bytes = 4;
  speech.error = null;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/speech", () => {
  it("returns audio for a signed-in session", async () => {
    signInLive("owner");
    const response = await POST(request({ text: "hello" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect((await response.arrayBuffer()).byteLength).toBe(4);
  });

  it("requires a session", async () => {
    resetRequest();
    const response = await POST(request({ text: "hello" }));
    expect(response.status).toBe(401);
  });

  it("returns 503 when speech is not configured", async () => {
    signInLive("owner");
    speech.configured = false;
    const response = await POST(request({ text: "hello" }));
    expect(response.status).toBe(503);
  });

  it("returns 400 for empty text", async () => {
    signInLive("owner");
    const response = await POST(request({ text: "   " }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for a non-JSON body", async () => {
    signInLive("owner");
    const response = await POST(request("not json"));
    expect(response.status).toBe(400);
  });

  it("surfaces a provider error with its status", async () => {
    signInLive("owner");
    const { SpeechError } = await import("@/ai/speech/synthesize");
    speech.error = new SpeechError("Speech: quota exceeded", 402);
    const response = await POST(request({ text: "hello" }));
    expect(response.status).toBe(402);
    expect((await response.json()).error).toContain("quota");
  });
});
