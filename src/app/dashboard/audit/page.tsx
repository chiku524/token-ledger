import Link from "next/link";
import { can } from "@/auth/roles";
import { PageHeader } from "@/components/page-header";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { auditSubjectTypes, filterAuditEvents, parseAuditFilter } from "@/data/audit-filter";
import { actionLabel, subjectLabel } from "@/data/present";

export const metadata = { title: "History" };

function queryString(filter: { actor: string; action: string; subjectType: string; from: string; to: string }): string {
  const params = new URLSearchParams();
  if (filter.actor) params.set("actor", filter.actor);
  if (filter.action) params.set("action", filter.action);
  if (filter.subjectType) params.set("subjectType", filter.subjectType);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  return params.toString();
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const filter = parseAuditFilter(params);
  const events = filterAuditEvents(books.auditEvents, filter);
  const subjectTypes = auditSubjectTypes(books.auditEvents);
  const exportQuery = queryString(filter);
  const canExport = can(session.role, "books.export");

  return (
    <>
      <PageHeader
        kicker="Who did what"
        title="History"
        description="New companies, wallets and accounts, imports, posted entries, sign-ins, and user changes are listed here. Entries are not edited. Filter by name, action, subject, or dates, then download the result."
      />
      <form className="mb-6 grid gap-3 panel p-4 md:grid-cols-5" method="get">
        <label className="field">
          <span>Name</span>
          <input name="actor" defaultValue={filter.actor} placeholder="Who" />
        </label>
        <label className="field">
          <span>Action</span>
          <input name="action" defaultValue={filter.action} placeholder="journal.posted" />
        </label>
        <label className="field">
          <span>Subject</span>
          <select name="subjectType" defaultValue={filter.subjectType}>
            <option value="">Any</option>
            {subjectTypes.map((type) => (
              <option key={type} value={type}>
                {subjectLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input name="from" type="date" defaultValue={filter.from} />
        </label>
        <label className="field">
          <span>To</span>
          <input name="to" type="date" defaultValue={filter.to} />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-5">
          <button type="submit" className="btn">
            Filter
          </button>
          <Link href="/dashboard/audit" className="text-sm underline">
            Clear
          </Link>
          {canExport ? (
            <a className="btn-secondary" href={`/dashboard/audit/export${exportQuery ? `?${exportQuery}` : ""}`}>
              Download CSV
            </a>
          ) : null}
        </div>
      </form>

      {events.length === 0 ? (
        <p className="panel px-4 py-6 text-sm text-ink-soft">Nothing matches these filters.</p>
      ) : (
        <div className="overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">History</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Name</th>
                <th scope="col">What happened</th>
                <th scope="col">About</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="num text-left">{event.occurredAt.slice(0, 16).replace("T", " ")}</td>
                  <td>{event.actor}</td>
                  <td>{actionLabel(event.action)}</td>
                  <td>
                    {subjectLabel(event.subjectType)}
                    <span className="mt-1 block text-xs text-ink-soft">{event.subjectId}</span>
                  </td>
                  <td>{event.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
