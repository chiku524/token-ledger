import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { form, ORG, resetRequest, signInDemo, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/availability", () => ({ hasDatabase: () => true }));

const ai = vi.hoisted(() => ({ selection: { provider: "", model: "" }, saved: [] as Record<string, unknown>[] }));
vi.mock("@/ai/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/settings")>();
  return {
    ...actual,
    loadOrgAiSelection: vi.fn(async () => ai.selection),
    saveOrgAiSelection: vi.fn(async (_org: string, selection: { provider: string; model: string }) => {
      ai.saved.push(selection);
      ai.selection = selection;
    }),
  };
});

import { getAiSettingsAction, setAiSelectionAction, resetAiSelectionAction } from "./ai-actions";

const ENV = { AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k", CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" };

beforeEach(() => {
  resetRequest();
  ai.selection = { provider: "", model: "" };
  ai.saved = [];
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("getAiSettingsAction", () => {
  it("reports the switchable providers and the deployment default", async () => {
    signInLive("owner");
    const settings = await getAiSettingsAction();
    expect(settings.provider).toBe("openrouter");
    expect(settings.customized).toBe(false);
    const keys = settings.options.map((option) => option.key);
    expect(keys).toContain("openrouter");
    expect(keys).toContain("cloudflare");
    // A provider with no key is not offered.
    expect(keys).not.toContain("anthropic");
  });

  it("reflects an org override", async () => {
    ai.selection = { provider: "cloudflare", model: "@cf/qwen/qwen3-30b-a3b-fp8" };
    signInLive("owner");
    const settings = await getAiSettingsAction();
    expect(settings.provider).toBe("cloudflare");
    expect(settings.customized).toBe(true);
  });
});

describe("setAiSelectionAction", () => {
  it("lets an owner switch provider and model", async () => {
    signInLive("owner");
    const result = await setAiSelectionAction(form({ provider: "cloudflare", model: "@cf/qwen/qwen3-30b-a3b-fp8" }));
    expect(result.ok).toBe(true);
    expect(ai.saved[0]).toMatchObject({ provider: "cloudflare", model: "@cf/qwen/qwen3-30b-a3b-fp8" });
  });

  it("refuses a provider with no key", async () => {
    signInLive("owner");
    const result = await setAiSelectionAction(form({ provider: "anthropic" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no key/i);
  });

  it("refuses a non-admin role", async () => {
    signInLive("viewer");
    const result = await setAiSelectionAction(form({ provider: "cloudflare" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/owner or admin/i);
  });
});

describe("resetAiSelectionAction", () => {
  it("clears the override for an owner", async () => {
    signalReset();
    signInLive("owner");
    const result = await resetAiSelectionAction(form({}));
    expect(result.ok).toBe(true);
    expect(ai.saved[0]).toEqual({ provider: "", model: "" });
  });
});

function signalReset() {
  ai.selection = { provider: "cloudflare", model: "x" };
}

void signInDemo;
void ORG;
