import { canAccessEntity } from "@/auth/roles";
import type { AgentTool, ToolContext, ToolResult } from "./types";

/**
 * Read tools. They run immediately, return facts already scoped to the session's
 * entity scope, and never change anything. Each names the dashboard page it
 * mirrors so the reply can deep-link.
 *
 * See docs/ai-chatbot.md §4 (capability map).
 */

function entityName(ctx: ToolContext, entityId: string): string {
  return ctx.books.entities.find((entity) => entity.id === entityId)?.name ?? entityId;
}

export const listEntities: AgentTool = {
  name: "list_entities",
  description: "List the companies (legal entities) the user can see, with jurisdiction and functional currency.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  requiresConfirm: false,
  permission: "books.read",
  async execute(_input, ctx): Promise<ToolResult> {
    const entities = ctx.books.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      jurisdiction: entity.jurisdiction,
      currency: entity.functionalCurrency,
    }));
    return { summary: `${entities.length} compan${entities.length === 1 ? "y" : "ies"}.`, data: entities, route: "/dashboard/entities" };
  },
};

export const listHoldings: AgentTool = {
  name: "list_holdings",
  description: "List observed balances (holdings) by asset, the latest snapshot per source. These are observed, not booked.",
  parameters: {
    type: "object",
    properties: { entityId: { type: "string", description: "Optional company id to narrow to." } },
    additionalProperties: false,
  },
  kind: "read",
  requiresConfirm: false,
  permission: "books.read",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = typeof input.entityId === "string" ? input.entityId : undefined;
    if (entityId && !canAccessEntity(ctx.session, entityId)) {
      return { summary: "That company is outside your access.", route: "/dashboard/sources" };
    }
    const snapshots = entityId
      ? ctx.books.balanceSnapshots.filter((snapshot) => snapshot.entityId === entityId)
      : ctx.books.balanceSnapshots;
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.sourceId}:${snapshot.assetCode}`;
      const current = latest.get(key);
      if (!current || snapshot.asOf > current.asOf) latest.set(key, snapshot);
    }
    const rows = [...latest.values()].map((snapshot) => ({
      entity: entityName(ctx, snapshot.entityId),
      asset: snapshot.assetCode,
      quantityMinor: snapshot.quantityMinor.toString(),
      asOf: snapshot.asOf,
    }));
    return { summary: `${rows.length} observed holding${rows.length === 1 ? "" : "s"}.`, data: rows, route: "/dashboard/sources" };
  },
};

export const listJournal: AgentTool = {
  name: "list_journal",
  description: "List posted journal entries, newest first, with reference, date, memo and totals.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string", description: "Optional company id." },
      limit: { type: "number", description: "How many entries to return (default 20)." },
    },
    additionalProperties: false,
  },
  kind: "read",
  requiresConfirm: false,
  permission: "books.read",
  async execute(input, ctx): Promise<ToolResult> {
    const entityId = typeof input.entityId === "string" ? input.entityId : undefined;
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(input.limit, 100) : 20;
    const entries = ctx.books.journalEntries
      .filter((entry) => !entityId || entry.entityId === entityId)
      .sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1))
      .slice(0, limit)
      .map((entry) => ({
        reference: entry.reference,
        date: entry.entryDate,
        entity: entityName(ctx, entry.entityId),
        memo: entry.memo,
        currency: entry.currency,
        debitMinor: entry.debitMinor.toString(),
        creditMinor: entry.creditMinor.toString(),
      }));
    return { summary: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`, data: entries, route: "/dashboard/ledger" };
  },
};

export const listReconciliation: AgentTool = {
  name: "list_reconciliation",
  description: "List reconciliation exceptions (unmatched source movements) and matched counts.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  requiresConfirm: false,
  permission: "books.read",
  async execute(_input, ctx): Promise<ToolResult> {
    const exceptions = ctx.books.reconciliations.filter((record) => record.status === "exception");
    const rows = exceptions.map((record) => ({
      entity: entityName(ctx, record.entityId),
      asset: record.assetCode,
      direction: record.direction,
      quantityMinor: record.quantityMinor.toString(),
      period: `${record.periodStart}..${record.periodEnd}`,
      note: record.note,
    }));
    return { summary: `${rows.length} exception${rows.length === 1 ? "" : "s"}.`, data: rows, route: "/dashboard/reconciliation" };
  },
};

export const listConnections: AgentTool = {
  name: "list_connections",
  description: "List read-only connections (wallets, exchanges, custodians) and their status.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  requiresConfirm: false,
  permission: "books.read",
  async execute(_input, ctx): Promise<ToolResult> {
    const rows = ctx.books.connections.map((connection) => ({
      name: connection.name,
      entity: entityName(ctx, connection.entityId),
      mode: connection.mode,
      venue: connection.venue,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
    }));
    return { summary: `${rows.length} connection${rows.length === 1 ? "" : "s"}.`, data: rows, route: "/dashboard/sources" };
  },
};

export const listAudit: AgentTool = {
  name: "list_audit_events",
  description: "List recent audit events (who did what), newest first.",
  parameters: {
    type: "object",
    properties: { limit: { type: "number", description: "How many events (default 20)." } },
    additionalProperties: false,
  },
  kind: "read",
  requiresConfirm: false,
  permission: "audit.read",
  async execute(input, ctx): Promise<ToolResult> {
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(input.limit, 100) : 20;
    const rows = ctx.books.auditEvents
      .slice()
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, limit)
      .map((event) => ({ occurredAt: event.occurredAt, actor: event.actor, action: event.action, detail: event.detail }));
    return { summary: `${rows.length} event${rows.length === 1 ? "" : "s"}.`, data: rows, route: "/dashboard/audit" };
  },
};

export const readTools: readonly AgentTool[] = [
  listEntities,
  listHoldings,
  listJournal,
  listReconciliation,
  listConnections,
  listAudit,
];
