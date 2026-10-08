import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Intercept drizzle's condition builders so the fake client below can read the
 * equality filters the store applies. Everything else in drizzle-orm is the
 * real module.
 */
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  type Filter = { column: string; value: unknown };
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown): Filter => ({ column: column.name, value }),
    and: (...conditions: (Filter | undefined)[]): Filter[] => conditions.filter((condition): condition is Filter => Boolean(condition)),
  };
});

/**
 * A minimal in-memory stand-in for the drizzle query builder, covering only the
 * calls `src/db/ai.ts` makes. Rows are kept per table; the equality filters the
 * store applies (org, thread, user) are honoured so scope isolation is real.
 */
const store = vi.hoisted(() => {
  const tables = new Map<unknown, Record<string, unknown>[]>();
  return {
    reset: () => tables.clear(),
    rowsFor: (table: unknown): Record<string, unknown>[] => {
      if (!tables.has(table)) tables.set(table, []);
      return tables.get(table)!;
    },
  };
});

vi.mock("@/db/client", () => ({
  getDb: () => {
    // Inserts use camelCase JS keys; `eq` reports the snake_case column name.
    const camel = (name: string) => name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    const asFilters = (conditions: unknown[]): { key: string; value: unknown }[] =>
      conditions
        .flatMap((condition) => (Array.isArray(condition) ? condition : [condition]))
        .map((filter) => {
          const { column, value } = filter as { column: string; value: unknown };
          return { key: camel(column), value };
        });
    const matches = (row: Record<string, unknown>, filters: { key: string; value: unknown }[]): boolean =>
      filters.every((filter) => row[filter.key] === filter.value);
    const db = {
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown> | Record<string, unknown>[]) => {
          const list = Array.isArray(values) ? values : [values];
          // Apply the column defaults the store relies on (`defaultNow()`,
          // `default=false`, `default=''`) since the fake has no schema.
          store.rowsFor(table).push(
            ...list.map((row) => ({
              archived: false,
              entityScope: "",
              content: "",
              createdAt: new Date(),
              updatedAt: new Date(),
              ...row,
            })),
          );
        },
      }),
      update: (table: unknown) => ({
        set: (patch: Record<string, unknown>) => ({
          where: async (...conditions: unknown[]) => {
            const filters = asFilters(conditions);
            for (const row of store.rowsFor(table)) if (matches(row, filters)) Object.assign(row, patch);
          },
        }),
      }),
      select: () => ({
        from: (table: unknown) => ({
          where: (...conditions: unknown[]) => {
            const filters = asFilters(conditions);
            const rows = () => store.rowsFor(table).filter((row) => matches(row, filters));
            return {
              orderBy: () => rows(),
              limit: async () => rows(),
              then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve),
            };
          },
        }),
      }),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    };
    return db;
  },
}));

const {
  appendMessage,
  archiveThread,
  auditToolRun,
  createThread,
  listThreads,
  loadMessages,
  loadThread,
  loadToolCall,
  recordToolCall,
  renameThread,
  resolveToolCall,
} = await import("./ai");
const { auditEvents } = await import("./schema");

const ORG = "org_harbourline";
const USER = "user_owner";

beforeEach(() => {
  store.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("threads", () => {
  it("creates, scopes and reloads a thread", async () => {
    const id = await createThread({ organizationId: ORG, userId: USER, title: "First", entityScope: "ent_my" });
    const thread = await loadThread(ORG, USER, id);
    expect(thread?.title).toBe("First");
    expect(thread?.entityScope).toBe("ent_my");
    expect(await loadThread(ORG, "user_other", id)).toBeNull();
    expect(await loadThread("org_other", USER, id)).toBeNull();
  });

  it("lists only the user's non-archived threads", async () => {
    const mine = await createThread({ organizationId: ORG, userId: USER, title: "Mine" });
    await createThread({ organizationId: ORG, userId: "user_other", title: "Theirs" });
    const archivable = await createThread({ organizationId: ORG, userId: USER, title: "Old" });
    await archiveThread(ORG, archivable);
    expect((await listThreads(ORG, USER)).map((thread) => thread.id)).toEqual([mine]);
    expect((await listThreads(ORG, USER, { includeArchived: true })).map((thread) => thread.id).sort()).toEqual([mine, archivable].sort());
  });

  it("renames a thread", async () => {
    const id = await createThread({ organizationId: ORG, userId: USER, title: "Untitled" });
    await renameThread(ORG, id, "Coinbase question");
    expect((await loadThread(ORG, USER, id))?.title).toBe("Coinbase question");
  });
});

describe("messages", () => {
  it("appends and reloads messages in order, scoped by org", async () => {
    const threadId = await createThread({ organizationId: ORG, userId: USER, title: "T" });
    await appendMessage({ organizationId: ORG, threadId, role: "user", content: "open matching" });
    await appendMessage({ organizationId: ORG, threadId, role: "assistant", content: "Opening it.", provider: "ollama", model: "llama3.1" });
    const messages = await loadMessages(ORG, threadId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1].provider).toBe("ollama");
    expect(await loadMessages("org_other", threadId)).toEqual([]);
  });
});

describe("tool calls", () => {
  it("records a proposed write and resolves it after a confirm", async () => {
    const threadId = await createThread({ organizationId: ORG, userId: USER, title: "T" });
    const messageId = await appendMessage({ organizationId: ORG, threadId, role: "assistant", content: "Shall I post it?" });
    const callId = await recordToolCall({
      organizationId: ORG,
      threadId,
      messageId,
      toolName: "post_journal",
      args: { entityId: "ent_my" },
      status: "proposed",
      requiresConfirm: true,
    });
    const proposed = await loadToolCall(ORG, callId);
    expect(proposed?.status).toBe("proposed");
    expect(proposed?.requiresConfirm).toBe(true);

    const auditEventId = await auditToolRun({
      organizationId: ORG,
      actor: "Owner <owner@harbourline.example>",
      toolName: "post_journal",
      subjectId: callId,
      detail: "JE-1 posted",
    });
    await resolveToolCall({ organizationId: ORG, toolCallId: callId, status: "ran", result: { entryId: "je_1" }, auditEventId });
    const resolved = await loadToolCall(ORG, callId);
    expect(resolved?.status).toBe("ran");
    expect(resolved?.auditEventId).toBe(auditEventId);
    expect(resolved?.result).toEqual({ entryId: "je_1" });
    expect(store.rowsFor(auditEvents)).toHaveLength(1);
  });

  it("records a rejection without running or auditing", async () => {
    const threadId = await createThread({ organizationId: ORG, userId: USER, title: "T" });
    const callId = await recordToolCall({ organizationId: ORG, threadId, toolName: "close_period", args: {}, status: "proposed", requiresConfirm: true });
    await resolveToolCall({ organizationId: ORG, toolCallId: callId, status: "rejected" });
    expect((await loadToolCall(ORG, callId))?.status).toBe("rejected");
    expect(store.rowsFor(auditEvents)).toHaveLength(0);
  });
});
