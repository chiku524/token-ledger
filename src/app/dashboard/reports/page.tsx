import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EXAMPLE_PERIOD, exampleAccounts, exampleBooks, exampleEntities, exampleJournalEntries } from "@/data/example-books";
import { formatMoney, formatQuantity } from "@/data/present";
import { assetCarryingSchedule, netBalanceMinor, trialBalance } from "@/ledger";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.entity) ? params.entity[0] : params.entity;
  const entity = exampleEntities.find((item) => item.id === requested) ?? exampleEntities[0];
  if (!entity) return null;

  const balance = trialBalance(exampleJournalEntries, exampleAccounts, entity.id);
  const carrying = assetCarryingSchedule(exampleJournalEntries, exampleAccounts, entity.id);
  const balanced = balance.debitTotal === balance.creditTotal;

  return (
    <>
      <PageHeader
        kicker={`${EXAMPLE_PERIOD.label} · ${entity.reportingFramework}`}
        title="Reports"
        description="A trial balance and a carrying-amount schedule for digital assets. Fair-value disclosure under IFRS 13, and a consolidated group report, are Institutional roadmap items — not computed here."
      />

      <nav aria-label="Reporting entity" className="mb-8 flex flex-wrap gap-2">
        {exampleEntities.map((item) => {
          const current = item.id === entity.id;
          return (
            <Link
              key={item.id}
              href={`/dashboard/reports?entity=${item.id}`}
              aria-current={current ? "page" : undefined}
              className={`border px-3 py-2 text-sm ${current ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised"}`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl">Trial balance</h2>
          <p className={balanced ? "text-sm text-pine" : "text-sm text-seal"}>
            {balanced ? "Debits equal credits" : "Out of balance"}
            {balance.currency ? ` · ${formatMoney(balance.debitTotal, balance.currency)}` : ""}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Trial balance for {entity.name}</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Account</th>
                <th scope="col">Basis</th>
                <th scope="col" className="num">Debit</th>
                <th scope="col" className="num">Credit</th>
                <th scope="col" className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {balance.rows.map((row) => (
                <tr key={row.code}>
                  <td className="num text-left">{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.measurementBasis ?? "—"}</td>
                  <td className="num">{balance.currency && row.debitMinor > 0n ? formatMoney(row.debitMinor, balance.currency) : ""}</td>
                  <td className="num">{balance.currency && row.creditMinor > 0n ? formatMoney(row.creditMinor, balance.currency) : ""}</td>
                  <td className="num">{balance.currency ? formatMoney(netBalanceMinor(row), balance.currency) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Digital asset carrying amounts</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Grouped by the measurement basis on the account. IAS 38, IAS 2, and IFRS 9 labels in this sample are illustrative,
          not a policy election. Empty bases, such as inventory with no movements, are omitted.
        </p>
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Carrying amounts for {entity.name}</caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Basis</th>
                <th scope="col" className="num">Quantity</th>
                <th scope="col" className="num">Carrying amount</th>
              </tr>
            </thead>
            <tbody>
              {carrying.length === 0 ? (
                <tr>
                  <td colSpan={4}>No digital asset movements in this period.</td>
                </tr>
              ) : (
                carrying.map((row) => (
                  <tr key={`${row.measurementBasis}-${row.assetCode}`}>
                    <td>{row.assetCode}</td>
                    <td>{row.measurementBasis}</td>
                    <td className="num">{formatQuantity(row.quantityMinor, row.assetCode)}</td>
                    <td className="num">{formatMoney(row.carryingMinor, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Sync to Xero, QuickBooks, and ERPs uses the stub adapters in <span className="font-mono text-xs">src/adapters/accounting</span>.{" "}
        {exampleBooks.notice}
      </p>
    </>
  );
}
