import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { EntityForm, ReadOnlyNote, RoleNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName } from "@/data/present";

export const metadata = { title: "Entities" };

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const allowed = can(session.role, "entity.write");
  const writable = booksAreWritable() && !session.demo;

  return (
    <>
      <PageHeader
        kicker="Organization"
        title="Legal entities"
        description="A parent and its subsidiaries share one organization. Consolidation translates their functional currencies on the consolidation page."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {allowed ? (
        <>
          {writable ? null : <ReadOnlyNote demo={session.demo} />}
          <EntityForm books={books} csrf={await ensureCsrf()} />
        </>
      ) : (
        <RoleNote>Your role can view entities. Adding one is limited to owners and admins.</RoleNote>
      )}
      {books.entities.length === 0 ? (
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No entities yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Legal entities</caption>
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Jurisdiction</th>
                <th scope="col">Currency</th>
                <th scope="col">Framework</th>
                <th scope="col">Parent</th>
                <th scope="col" className="num">Accounts</th>
                <th scope="col" className="num">Sources</th>
              </tr>
            </thead>
            <tbody>
              {books.entities.map((entity) => (
                <tr key={entity.id}>
                  <td>{entity.name}</td>
                  <td>{entity.jurisdiction}</td>
                  <td>{entity.functionalCurrency}</td>
                  <td>{entity.reportingFramework}</td>
                  <td>{entity.parentEntityId ? entityName(entity.parentEntityId, books.entities) : "—"}</td>
                  <td className="num">{books.accounts.filter((account) => account.entityId === entity.id).length}</td>
                  <td className="num">{books.sources.filter((source) => source.entityId === entity.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        {books.organization.name} · origin {books.organization.origin}
      </p>
    </>
  );
}
