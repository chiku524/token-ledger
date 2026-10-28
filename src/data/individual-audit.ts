/**
 * What an individual's History page and download show. The audit log is shared
 * by every kind of account, so it also holds events that only make sense to an
 * organization (a posted entry, a closed period, a matching run). A person who
 * never keeps books sees none of those, and the events they do see read in plain
 * words instead of as `journal.posted`-style keys. The stored log is unchanged.
 */
import type { AuditEvent } from "./books";
import { actionLabel, subjectLabel } from "./present";

/** Event families that belong to an organization's books, not to a person. */
const ORGANIZATION_ONLY_PREFIXES = [
  "journal.",
  "period.",
  "reconciliation.",
  "settlement.",
  "invoice.",
  "supplier.",
  "treasury.",
  "billing.",
  "entity.",
  "onboarding.",
] as const;

const ORGANIZATION_ONLY_SUBJECTS = new Set(["journal_entry", "entity", "period", "reconciliation", "invoice", "supplier"]);

/** Accounting wording in an event's own text. An event that says it is not for a person. */
const ACCOUNTING_WORDS = /journal|ledger|debit|credit|reconcil|trial balance|chart of accounts|consolidat|accrual|\bentr(?:y|ies)\b/i;

export function isOrganizationOnlyEvent(event: Pick<AuditEvent, "action" | "subjectType" | "detail">): boolean {
  return (
    ORGANIZATION_ONLY_PREFIXES.some((prefix) => event.action.startsWith(prefix)) ||
    ORGANIZATION_ONLY_SUBJECTS.has(event.subjectType) ||
    ACCOUNTING_WORDS.test(event.detail)
  );
}

/** The events an individual may see, in their stored order. */
export function individualAuditEvents<T extends Pick<AuditEvent, "action" | "subjectType" | "detail">>(
  events: readonly T[],
): T[] {
  return events.filter((event) => !isOrganizationOnlyEvent(event));
}

/** "wallet.bound" read as "Wallet bound" when no friendlier label exists. */
function humanize(action: string): string {
  const words = action.replace(/[._]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

/** A plain sentence for what happened. Never the raw key. */
export function individualActionLabel(action: string): string {
  const label = actionLabel(action);
  return label === action ? humanize(action) : label;
}

/** A plain name for what the event was about. Never the raw key. */
export function individualSubjectLabel(subjectType: string): string {
  const label = subjectLabel(subjectType);
  return label === subjectType ? humanize(subjectType) : label;
}
