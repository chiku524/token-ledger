/**
 * Download the audit log, filtered the same way as the History page. The log is
 * organization-wide and append-only; an entity scope does not hide it, matching
 * the page.
 */
import { getSession } from "@/auth/current";
import { can } from "@/auth/roles";
import { auditCsv } from "@/ledger";
import { filterAuditEvents, parseAuditFilter, withDefaultAuditRange } from "@/data/audit-filter";
import { defaultActivityRange } from "@/data/period";
import { booksForSession } from "@/data/authorized-books";
import { isIndividualAccount } from "@/data/account-sections";
import { individualActionLabel, individualAuditEvents, individualSubjectLabel } from "@/data/individual-audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "audit.read")) {
    return new Response("Sign in to export history.", { status: 401 });
  }
  const url = new URL(request.url);
  const requested = parseAuditFilter({
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    subjectType: url.searchParams.get("subjectType") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const books = await booksForSession(session);
  // An individual downloads only their own kind of events, in plain words.
  const individual = isIndividualAccount(session.accountType);
  // The same default range as the History page, unless the request names one.
  const filter = individual
    ? withDefaultAuditRange(
        requested,
        { ...(url.searchParams.has("from") ? { from: "" } : {}), ...(url.searchParams.has("to") ? { to: "" } : {}) },
        defaultActivityRange(books),
      )
    : requested;
  const filtered = filterAuditEvents(individual ? individualAuditEvents(books.auditEvents) : books.auditEvents, filter);
  const rows = individual
    ? filtered.map((event) => ({
        ...event,
        action: individualActionLabel(event.action),
        subjectType: individualSubjectLabel(event.subjectType),
      }))
    : filtered;
  return new Response(auditCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit.csv"',
      "Cache-Control": "no-store",
    },
  });
}
