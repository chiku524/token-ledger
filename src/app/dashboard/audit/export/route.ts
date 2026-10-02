/**
 * Download the audit log, filtered the same way as the History page. The log is
 * organization-wide and append-only; an entity scope does not hide it, matching
 * the page.
 */
import { getSession } from "@/auth/current";
import { can } from "@/auth/roles";
import { auditCsv } from "@/ledger";
import { filterAuditEvents, parseAuditFilter } from "@/data/audit-filter";
import { loadBooks } from "@/data/load-books";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "audit.read")) {
    return new Response("Sign in to export history.", { status: 401 });
  }
  const url = new URL(request.url);
  const filter = parseAuditFilter({
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    subjectType: url.searchParams.get("subjectType") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const books = await loadBooks(session.organizationId);
  const rows = filterAuditEvents(books.auditEvents, filter);
  return new Response(auditCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit.csv"',
      "Cache-Control": "no-store",
    },
  });
}
