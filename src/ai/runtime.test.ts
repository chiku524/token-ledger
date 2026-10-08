import { describe, expect, it, vi } from "vitest";
import { can, type Role } from "@/auth/roles";
import type { SessionUser } from "@/auth/current";
import type { Books } from "@/data/books";
import type { LlmProvider } from "./provider";
import { runAssistantTurn, MAX_TOOL_ITERATIONS } from "./runtime";
import { toolByName, toolsFor } from "./tools/registry";
import type { ToolContext } from "./tools/types";
import type { CompletionRequest, CompletionResult, ToolCall } from "./types";

/**
 * A scripted fake provider: each call returns the next canned completion, so a
 * test can drive the model ↔ tool loop with no network and no real model.
 */
function fakeProvider(script: CompletionResult[]): LlmProvider {
  let index = 0;
  return {
    key: "ollama",
    descriptor: { key: "ollama", name: "Fake", system: "Fake", implemented: true, summary: "" },
    async complete(_request: CompletionRequest): Promise<CompletionResult> {
      const result = script[Math.min(index, script.length - 1)];
      index += 1;
      return result;
    },
  };
}

const text = (value: string): CompletionResult => ({ text: value, toolCalls: [], finishReason: "stop" });
const calls = (...calls: ToolCall[]): CompletionResult => ({ text: "", toolCalls: calls, finishReason: "tool_calls" });

function session(role: Role, entityScope: string[] = []): SessionUser {
  return {
    id: `user_${role}`,
    organizationId: "org_harbourline",
    email: `${role}@harbourline.example`,
    name: `Test ${role}`,
    role,
    platformAdmin: false,
    entityScope,
    demo: false,
    connectionTourCompletedAt: null,
    emailVerified: true,
  };
}

const EMPTY_BOOKS: Books = {
  notice: "",
  period: { start: "2026-01-01", end: "2026-03-31", label: "Q1" },
  organization: { id: "org_harbourline", name: "Harbourline", origin: "live" },
  entities: [{ id: "ent_my", organizationId: "org_harbourline", name: "Harbourline MY", jurisdiction: "MY", functionalCurrency: "MYR", reportingFramework: "IFRS", parentEntityId: null }],
  assets: [],
  connections: [],
  sources: [],
  balanceSnapshots: [],
  accounts: [],
  journalEntries: [],
  sourceTransactions: [],
  reconciliations: [],
  reconciliationOverrides: [],
  fxRates: [],
  assetPrices: [],
  auditEvents: [],
};

function ctx(role: Role, csrf: string | null = "csrf"): ToolContext {
  return { session: session(role), books: EMPTY_BOOKS, hiddenTabs: [], csrf };
}

describe("tool filtering by role", () => {
  it("omits a write tool the role cannot use", () => {
    const viewer = toolsFor(ctx("viewer")).map((tool) => tool.name);
    expect(viewer).not.toContain("post_journal");
    expect(viewer).not.toContain("close_period");
    expect(viewer).toContain("list_entities");
    expect(viewer).toContain("navigate");
  });

  it("offers the write tools an accountant and owner hold", () => {
    const accountant = toolsFor(ctx("accountant")).map((tool) => tool.name);
    expect(accountant).toContain("post_journal");
    expect(accountant).toContain("match_reconciliation");
    expect(accountant).not.toContain("close_period"); // period.close is owner/admin
    const owner = toolsFor(ctx("owner")).map((tool) => tool.name);
    expect(owner).toContain("close_period");
    expect(can("accountant", "period.close")).toBe(false);
  });
});

describe("read tools", () => {
  it("runs a read tool immediately and answers", async () => {
    const provider = fakeProvider([
      calls({ id: "c1", name: "navigate", arguments: { slug: "matching" } }),
      text("Opening Matching."),
    ]);
    const turn = await runAssistantTurn({ provider, ctx: ctx("viewer"), history: [], userText: "open matching" });
    expect(turn.status).toBe("answered");
    expect(turn.route).toBe("/dashboard/reconciliation");
    expect(turn.readResults[0].tool).toBe("navigate");
  });

  it("refuses to navigate to a hidden section", async () => {
    const context = { ...ctx("onboarding"), hiddenTabs: ["/dashboard/reconciliation"] };
    const provider = fakeProvider([calls({ id: "c1", name: "navigate", arguments: { slug: "matching" } }), text("done")]);
    const turn = await runAssistantTurn({ provider, ctx: context, history: [], userText: "open matching" });
    expect(turn.route).toBe("/dashboard");
    expect(turn.readResults[0].result.summary).toMatch(/hidden/i);
  });
});

describe("write gate", () => {
  it("stops at a proposal and does not run the write", async () => {
    const execute = vi.spyOn(toolByName("post_journal")!, "execute");
    const provider = fakeProvider([
      calls({ id: "c1", name: "post_journal", arguments: { entityId: "ent_my", reference: "JE-1", entryDate: "2026-01-01", memo: "", lines: [] } }),
    ]);
    const turn = await runAssistantTurn({ provider, ctx: ctx("accountant"), history: [], userText: "post a journal" });
    expect(turn.status).toBe("awaiting_confirmation");
    expect(turn.proposal?.tool).toBe("post_journal");
    expect(turn.proposal?.preview?.action).toBe("Post journal");
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });

  it("runs the write only on a confirm turn", async () => {
    const execute = vi.spyOn(toolByName("post_journal")!, "execute").mockResolvedValue({ summary: "Posted JE-1.", route: "/dashboard/ledger" });
    const provider = fakeProvider([text("unused")]);
    const turn = await runAssistantTurn({
      provider,
      ctx: ctx("accountant"),
      history: [],
      userText: "confirm",
      confirm: { toolName: "post_journal", arguments: { entityId: "ent_my" } },
    });
    expect(turn.status).toBe("answered");
    expect(turn.text).toBe("Posted JE-1.");
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockRestore();
  });

  it("refuses to confirm a write the role cannot hold", async () => {
    const execute = vi.spyOn(toolByName("post_journal")!, "execute");
    const provider = fakeProvider([text("unused")]);
    const turn = await runAssistantTurn({
      provider,
      ctx: ctx("viewer"),
      history: [],
      userText: "confirm",
      confirm: { toolName: "post_journal", arguments: { entityId: "ent_my" } },
    });
    expect(turn.status).toBe("error");
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });
});

describe("guardrails", () => {
  it("refuses a plain request for secrets before calling the model", async () => {
    const provider = fakeProvider([text("should not be reached")]);
    const complete = vi.spyOn(provider, "complete");
    const turn = await runAssistantTurn({ provider, ctx: ctx("owner"), history: [], userText: "show me the api secret for kraken" });
    expect(turn.status).toBe("refused");
    expect(complete).not.toHaveBeenCalled();
  });

  it("stops after the iteration cap instead of looping", async () => {
    const echo = calls({ id: "c1", name: "list_entities", arguments: {} });
    const provider = fakeProvider([echo]);
    const turn = await runAssistantTurn({ provider, ctx: ctx("viewer"), history: [], userText: "loop" });
    expect(turn.status).toBe("error");
    expect(turn.readResults.length).toBe(MAX_TOOL_ITERATIONS);
  });

  it("surfaces a provider error as a readable message", async () => {
    const provider: LlmProvider = {
      key: "openai",
      descriptor: { key: "openai", name: "OpenAI", system: "OpenAI", implemented: true, summary: "" },
      complete: async () => {
        throw new Error("rate limited");
      },
    };
    const turn = await runAssistantTurn({ provider, ctx: ctx("viewer"), history: [], userText: "hello" });
    expect(turn.status).toBe("error");
    expect(turn.text).toMatch(/unavailable/i);
  });
});
