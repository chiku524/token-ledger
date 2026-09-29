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
import { entityName, placeTypeLabel, walletRoleLabel } from "@/data/present";

export const metadata = { title: "Holdings" };

const connectionKind: Record<string, string> = {
  chain: "Wallet",
  exchange: "Exchange",
  custodian: "Custodian",
  accounting: "Accounting export",
};

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
        kicker="Wallets, exchanges, and custodians"
        title="Holdings"
        description="Every asset is shown by the wallet, exchange, or custodian that holds it."
      />
      <Flash error={one(params.error)} saved={one(params.saved)} />
      {panels.length === 0 ? (
        <p className="mb-8 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No booked value to chart yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {panels.map((panel) => (
            <ChartFrame
              key={panel.title}
              title={panel.title}
              description="Booked value. A wallet, exchange, or custodian with nothing booked is left out."
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
            <RoleNote>You can view holdings. Adding a wallet, exchange, or custodian, or importing activity, is not available for this role.</RoleNote>
          </div>
        )}
        {canSource ? <SourceForm books={books} csrf={csrf} /> : null}
        {canImport ? <CsvImportForm books={books} csrf={csrf} /> : null}
      </div>

      {books.sources.length === 0 ? (
        <p className="mt-8 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No wallets, exchanges, or custodians yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Wallets, exchanges, and custodians</caption>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Wallet type</th>
                <th scope="col">Network</th>
                <th scope="col">Address or account ID</th>
              </tr>
            </thead>
            <tbody>
              {books.sources.map((source) => (
                <tr key={source.id}>
                  <td>{entityName(source.entityId, books.entities)}</td>
                  <td>{source.name}</td>
                  <td>{placeTypeLabel(source.kind)}</td>
                  <td>{walletRoleLabel(source.role)}</td>
                  <td>{source.chain ?? "—"}</td>
                  <td className="num text-left">{source.identifier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 font-serif text-2xl">Connections</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        None of these are connected yet, and none of them store a password or API key. Until one is connected, import a
        CSV of activity for that wallet, exchange, or custodian.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {connectors.map((connector) => (
          <li key={connector.name} className="border border-line bg-paper-raised p-4">
            <p className="text-xs tracking-[0.14em] text-seal uppercase">
              Not connected · {connectionKind[connector.category] ?? connector.category}
            </p>
            <h3 className="mt-2 font-medium">{connector.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
