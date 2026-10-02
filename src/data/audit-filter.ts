/**
 * Filtering the append-only audit log. Pure, so the query parsing and the filter
 * rule are tested without a database. The actor and action filters are
 * case-insensitive substring matches; the date range is inclusive.
 */
import type { AuditEvent } from "./books";

export interface AuditFilter {
  actor: string;
  action: string;
  subjectType: string;
  from: string;
  to: string;
}

export const EMPTY_AUDIT_FILTER: AuditFilter = { actor: "", action: "", subjectType: "", from: "", to: "" };

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Read a filter from URL search params, ignoring anything absent. */
export function parseAuditFilter(params: Record<string, string | string[] | undefined>): AuditFilter {
  return {
    actor: one(params.actor),
    action: one(params.action),
    subjectType: one(params.subjectType),
    from: one(params.from),
    to: one(params.to),
  };
}

export function hasAuditFilter(filter: AuditFilter): boolean {
  return Boolean(filter.actor || filter.action || filter.subjectType || filter.from || filter.to);
}

/** Apply a filter, newest-first. */
export function filterAuditEvents(events: readonly AuditEvent[], filter: AuditFilter): AuditEvent[] {
  const actor = filter.actor.toLowerCase();
  const action = filter.action.toLowerCase();
  const subjectType = filter.subjectType.toLowerCase();
  return events
    .filter((event) => {
      if (actor && !event.actor.toLowerCase().includes(actor)) return false;
      if (action && !event.action.toLowerCase().includes(action)) return false;
      if (subjectType && event.subjectType.toLowerCase() !== subjectType) return false;
      const day = event.occurredAt.slice(0, 10);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      return true;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}

/** Distinct subject types present, for the filter dropdown. */
export function auditSubjectTypes(events: readonly AuditEvent[]): string[] {
  return [...new Set(events.map((event) => event.subjectType))].sort();
}
