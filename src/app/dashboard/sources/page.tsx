import { listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { CsvImportForm, ReadOnlyNote, RoleNote, SourceForm } from "@/components/record-forms";
import { chainPanels, sourceCarryingPanels, sourceKindPanels } from "@/data/charts";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { one } from "@/data/query";
import { entityName } from "@/data/present";

export const metadata = { title: "Sources" };

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const writable = booksAreWritable() && !session.demo;
  const canSource = can(session.role, "source.write");
  const canImport = can(session.role, "source.import");
  const csrf = canSource || canImport ? await ensureCsrf() : "";
  const connectors = listStubAdapters();
  const panels = [...sourceCarryingPanels(books), ...sourceKindPanels(books), ...chainPanels(books)];

  return (
    <>
      <PageHeader
        kicker="Where the assets sit"
        title="Sources"
        description="Wallets (hot, cold, staking), exchanges, and custodians, with chain context where the source is on-chain."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {panels.length === 0 ? (
        <p className="mb-8 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No carrying amounts to chart yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {panels.map((panel) => (
            <ChartFrame
              key={panel.title}
              title={panel.title}
              description="Carrying amount booked to sources. A source with a zero balance is omitted here."
              rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
            >
              <MoneyBars rows={panel.rows} currency={panel.currency} />
            </ChartFrame>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        {!writable && (canSource || canImport) ? (
          <div className="xl:col-span-2">
            <ReadOnlyNote demo={session.demo} />
          </div>
        ) : null}
        {canSource || canImport ? null : (
          <div className="xl:col-span-2">
            <RoleNote>Your role can view sources. Adding a source or importing a CSV is not available for this role.</RoleNote>
          </div>
        )}
        {canSource ? <SourceForm books={books} csrf={csrf} /> : null}
        {canImport ? <CsvImportForm books={books} csrf={csrf} /> : null}
      </div>

      {books.sources.length === 0 ? (
        <p className="mt-8 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No sources yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Wallets, exchanges, and custodians</caption>
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Source</th>
                <th scope="col">Kind</th>
                <th scope="col">Role</th>
                <th scope="col">Chain</th>
                <th scope="col">Identifier</th>
              </tr>
            </thead>
            <tbody>
              {books.sources.map((source) => (
                <tr key={source.id}>
                  <td>{entityName(source.entityId, books.entities)}</td>
                  <td>{source.name}</td>
                  <td className="capitalize">{source.kind}</td>
                  <td className="capitalize">{source.role ?? "—"}</td>
                  <td>{source.chain ?? "—"}</td>
                  <td className="num text-left">{source.identifier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 font-serif text-2xl">Connectors</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        These adapters are stubs. They do not hold API keys and their fetch methods reject before any network call. CSV import is the path for source facts until a connector is live.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {connectors.map((connector) => (
          <li key={connector.name} className="border border-line bg-paper-raised p-4">
            <p className="text-xs tracking-[0.14em] text-seal uppercase">Stub · {connector.category}</p>
            <h3 className="mt-2 font-medium">{connector.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
