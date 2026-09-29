import { listStubAdapters } from "@/adapters";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { PageHeader } from "@/components/page-header";
import { chainPanels, sourceCarryingPanels, sourceKindPanels } from "@/data/charts";
import { exampleSources } from "@/data/example-books";
import { entityName } from "@/data/present";

export const metadata = { title: "Sources" };

export default function SourcesPage() {
  const connectors = listStubAdapters();

  return (
    <>
      <PageHeader
        kicker="Where the assets sit"
        title="Sources"
        description="Wallets (hot, cold, staking), exchanges, and custodians, with chain context where the source is on-chain. Identifiers below are fake."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {[...sourceCarryingPanels(), ...sourceKindPanels(), ...chainPanels()].map((panel) => (
          <ChartFrame
            key={panel.title}
            title={panel.title}
            description="Carrying amount booked to sources. A source with a zero balance, including the hot wallet, is omitted here."
            rows={panel.rows.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={panel.rows} currency={panel.currency} />
          </ChartFrame>
        ))}
      </div>
      <div className="mt-8 overflow-x-auto border border-line bg-paper-raised">
        <table className="ledger-table">
          <caption className="sr-only">Example wallets, exchanges, and custodians</caption>
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
            {exampleSources.map((source) => (
              <tr key={source.id}>
                <td>{entityName(source.entityId)}</td>
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

      <h2 className="mt-10 font-serif text-2xl">Connectors</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        These adapters are stubs. They do not hold API keys and their fetch methods reject before any network call.
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
