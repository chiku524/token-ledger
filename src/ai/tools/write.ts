import { can, canAccessEntity } from "@/auth/roles";
import { actorName } from "@/auth/current";
import { postFormJournal, assertCanReverse } from "@/data/journal-form";
import { canWriteBooks } from "@/data/authorized-books";
import { insertJournal, insertReversal } from "@/db/write";
import { matchReconciliation, unmatchReconciliation } from "@/db/reconciliation";
import { closePeriod } from "@/db/period-locks";
import type { AgentTool, ToolContext, ToolResult } from "./types";

/**
 * Write tools. Each mirrors a dashboard action's guard order exactly — the
 * caller's permission, a writable (non-demo, database-backed) books state, and
 * entity scope — and then calls the same domain function the UI action calls.
 * The runtime records these as proposals and runs them only after an explicit
 * confirmation. See docs/ai-chatbot.md §5 and §7.
 */

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";
const NO_PERMISSION = "You do not have permission to do that.";
const OUTSIDE_ACCESS = "That company is outside your access.";

function guardWrite(ctx: ToolContext, permission: Parameters<typeof can>[1], entityId: string): string | null {
  if (!can(ctx.session.role, permission)) return NO_PERMISSION;
  if (!canWriteBooks(ctx.session)) return READ_ONLY;
  if (!canAccessEntity(ctx.session, entityId)) return OUTSIDE_ACCESS;
  if (!ctx.books.entities.some((entity) => entity.id === entityId)) return "Choose a company in this organization.";
  return null;
}

interface JournalLineInput {
  accountCode: string;
  side: "debit" | "credit";
  amount: string;
  assetCode?: string;
  quantity?: string;
  quantityDirection?: "in" | "out";
  sourceId?: string;
}

function parseLines(input: unknown): JournalLineInput[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const record = line as Record<string, unknown>;
    const side = record.side === "credit" ? "credit" : record.side === "debit" ? "debit" : null;
    if (!side || typeof record.accountCode !== "string" || record.amount === undefined) return [];
    return [
      {
        accountCode: record.accountCode,
        side,
        amount: String(record.amount),
        assetCode: typeof record.assetCode === "string" ? record.assetCode : undefined,
        quantity: record.quantity === undefined ? undefined : String(record.quantity),
        quantityDirection: record.quantityDirection === "out" ? "out" : record.quantityDirection === "in" ? "in" : undefined,
        sourceId: typeof record.sourceId === "string" ? record.sourceId : undefined,
      },
    ];
  });
}

export const postJournal: AgentTool = {
  name: "post_journal",
  description:
    "Post a balanced journal entry to a company. Provide at least two lines whose debits equal credits. The entry is immutable once posted; correct it with a reversal.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string", description: "The company to post to." },
      reference: { type: "string", description: "A unique reference for the entry, e.g. JE-1042." },
      entryDate: { type: "string", description: "ISO date YYYY-MM-DD." },
      memo: { type: "string", description: "What the entry is for." },
      lines: {
        type: "array",
        description: "The debit and credit lines. Amounts are in major units of the functional currency.",
        items: {
          type: "object",
          properties: {
            accountCode: { type: "string" },
            side: { type: "string", enum: ["debit", "credit"] },
            amount: { type: "string" },
            assetCode: { type: "string" },
            quantity: { type: "string" },
            quantityDirection: { type: "string", enum: ["in", "out"] },
            sourceId: { type: "string" },
          },
          required: ["accountCode", "side", "amount"],
          additionalProperties: false,
        },
      },
    },
    required: ["entityId", "reference", "entryDate", "memo", "lines"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "journal.post",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guardWrite(ctx, "journal.post", entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/ledger" };
    const lines = parseLines(input.lines);
    if (lines.length < 2) return { summary: "A journal needs at least two lines.", route: "/dashboard/ledger" };
    try {
      const entry = postFormJournal(
        {
          entityId,
          reference: String(input.reference ?? ""),
          entryDate: String(input.entryDate ?? ""),
          memo: String(input.memo ?? ""),
          lines,
        },
        ctx.books,
      );
      await insertJournal(ctx.books, entry, actorName(ctx.session));
      return {
        summary: `Posted ${entry.reference} for ${entry.entryDate}.`,
        data: { reference: entry.reference, entryId: entry.id, debitMinor: entry.debitMinor.toString() },
        route: "/dashboard/ledger",
      };
    } catch (error) {
      return { summary: error instanceof Error ? error.message : "Could not post the entry.", route: "/dashboard/ledger" };
    }
  },
};

export const reverseJournal: AgentTool = {
  name: "reverse_journal",
  description: "Reverse a posted journal entry, creating the correcting entry. Requires a reference and a reason.",
  parameters: {
    type: "object",
    properties: {
      reference: { type: "string", description: "The reference of the entry to reverse." },
      newReference: { type: "string", description: "A reference for the reversal." },
      entryDate: { type: "string", description: "ISO date YYYY-MM-DD." },
      memo: { type: "string", description: "Why it is being reversed." },
    },
    required: ["reference", "newReference", "entryDate", "memo"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "journal.reverse",
  async execute(input, ctx): Promise<ToolResult> {
    const reference = String(input.reference ?? "").trim();
    const original = ctx.books.journalEntries.find((entry) => entry.reference === reference);
    if (!original) return { summary: `No entry with reference ${reference}.`, route: "/dashboard/ledger" };
    const blocked = guardWrite(ctx, "journal.reverse", original.entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/ledger" };
    try {
      assertCanReverse(ctx.books.journalEntries, original.id);
      await insertReversal(
        ctx.books,
        original.id,
        { reference: String(input.newReference ?? ""), entryDate: String(input.entryDate ?? ""), memo: String(input.memo ?? "") },
        actorName(ctx.session),
      );
      return { summary: `Reversed ${reference}.`, data: { reference, newReference: input.newReference }, route: "/dashboard/ledger" };
    } catch (error) {
      return { summary: error instanceof Error ? error.message : "Could not reverse the entry.", route: "/dashboard/ledger" };
    }
  },
};

export const matchTransaction: AgentTool = {
  name: "match_reconciliation",
  description: "Match a source movement to a journal line. Requires a note explaining the match.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      sourceTransactionId: { type: "string" },
      journalEntryId: { type: "string" },
      journalLineNumber: { type: "number" },
      note: { type: "string" },
    },
    required: ["entityId", "sourceTransactionId", "journalEntryId", "journalLineNumber", "note"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "reconciliation.match",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guardWrite(ctx, "reconciliation.match", entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/reconciliation" };
    try {
      await matchReconciliation({
        organizationId: ctx.session.organizationId,
        entityId,
        sourceTransactionId: String(input.sourceTransactionId ?? ""),
        journalEntryId: String(input.journalEntryId ?? ""),
        journalLineNumber: Number(input.journalLineNumber ?? 0),
        note: String(input.note ?? ""),
        actor: actorName(ctx.session),
      });
      return { summary: "Matched the movement to the journal line.", route: "/dashboard/reconciliation" };
    } catch (error) {
      return { summary: error instanceof Error ? error.message : "Could not match.", route: "/dashboard/reconciliation" };
    }
  },
};

export const unmatchTransaction: AgentTool = {
  name: "unmatch_reconciliation",
  description: "Reject an automatic match, leaving the movement as an exception. Requires a note.",
  parameters: {
    type: "object",
    properties: { entityId: { type: "string" }, sourceTransactionId: { type: "string" }, note: { type: "string" } },
    required: ["entityId", "sourceTransactionId", "note"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "reconciliation.match",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guardWrite(ctx, "reconciliation.match", entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/reconciliation" };
    try {
      await unmatchReconciliation({
        organizationId: ctx.session.organizationId,
        entityId,
        sourceTransactionId: String(input.sourceTransactionId ?? ""),
        note: String(input.note ?? ""),
        actor: actorName(ctx.session),
      });
      return { summary: "Left the movement as an exception.", route: "/dashboard/reconciliation" };
    } catch (error) {
      return { summary: error instanceof Error ? error.message : "Could not unmatch.", route: "/dashboard/reconciliation" };
    }
  },
};

export const closePeriodTool: AgentTool = {
  name: "close_period",
  description: "Close a date range for a company. Posting, reversing and re-matching inside it are then refused until reopened.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      periodStart: { type: "string", description: "ISO date YYYY-MM-DD." },
      periodEnd: { type: "string", description: "ISO date YYYY-MM-DD." },
      note: { type: "string", description: "Why the period is being closed." },
    },
    required: ["entityId", "periodStart", "periodEnd", "note"],
    additionalProperties: false,
  },
  kind: "write",
  requiresConfirm: true,
  permission: "period.close",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = String(input.entityId ?? "");
    const blocked = guardWrite(ctx, "period.close", entityId);
    if (blocked) return { summary: blocked, route: "/dashboard/reconciliation" };
    try {
      await closePeriod({
        organizationId: ctx.session.organizationId,
        entityId,
        periodStart: String(input.periodStart ?? ""),
        periodEnd: String(input.periodEnd ?? ""),
        note: String(input.note ?? ""),
        actor: actorName(ctx.session),
      });
      return { summary: `Closed ${input.periodStart} to ${input.periodEnd}.`, route: "/dashboard/reconciliation" };
    } catch (error) {
      return { summary: error instanceof Error ? error.message : "Could not close the period.", route: "/dashboard/reconciliation" };
    }
  },
};

export const writeTools: readonly AgentTool[] = [
  postJournal,
  reverseJournal,
  matchTransaction,
  unmatchTransaction,
  closePeriodTool,
];
