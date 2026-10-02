import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./books";
import { auditSubjectTypes, EMPTY_AUDIT_FILTER, filterAuditEvents, hasAuditFilter, parseAuditFilter } from "./audit-filter";

function event(overrides: Partial<AuditEvent> & Pick<AuditEvent, "occurredAt" | "actor" | "action" | "subjectType">): AuditEvent {
  return {
    id: `audit_${overrides.occurredAt}_${overrides.action}`,
    organizationId: "org_1",
    subjectId: "x",
    detail: "",
    ...overrides,
  };
}

const events: AuditEvent[] = [
  event({ occurredAt: "2026-06-01T10:00:00.000Z", actor: "Amina <a@x>", action: "journal.posted", subjectType: "journal_entry" }),
  event({ occurredAt: "2026-06-05T10:00:00.000Z", actor: "Ben <b@x>", action: "connection.synced", subjectType: "connection" }),
  event({ occurredAt: "2026-04-01T10:00:00.000Z", actor: "Amina <a@x>", action: "auth.signed_in", subjectType: "user" }),
];

describe("parseAuditFilter", () => {
  it("trims values and reads the first of repeated params", () => {
    expect(parseAuditFilter({ actor: ["  Amina ", "x"], from: "2026-06-01" })).toMatchObject({
      actor: "Amina",
      from: "2026-06-01",
      to: "",
    });
  });
});

describe("filterAuditEvents", () => {
  it("matches actor and action case-insensitively and sorts newest first", () => {
    const rows = filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, actor: "amina" });
    // Newest first: June 1 before April 1.
    expect(rows.map((row) => row.action)).toEqual(["journal.posted", "auth.signed_in"]);
  });

  it("filters by subject type exactly and by inclusive date range", () => {
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, subjectType: "connection" })).toHaveLength(1);
    const ranged = filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, from: "2026-04-01", to: "2026-06-01" });
    expect(ranged.map((row) => row.action).sort()).toEqual(["auth.signed_in", "journal.posted"]);
  });

  it("returns everything when the filter is empty", () => {
    expect(filterAuditEvents(events, EMPTY_AUDIT_FILTER)).toHaveLength(3);
    expect(hasAuditFilter(EMPTY_AUDIT_FILTER)).toBe(false);
  });
});

describe("auditSubjectTypes", () => {
  it("lists distinct subject types sorted", () => {
    expect(auditSubjectTypes(events)).toEqual(["connection", "journal_entry", "user"]);
  });
});
