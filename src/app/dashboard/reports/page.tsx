import Link from "next/link";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { reportAssetBars, reportComposition } from "@/data/charts";
import { loadBooks } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { formatMoney, formatQuantity } from "@/data/present";
import { assetCarryingSchedule, netBalanceMinor, trialBalance } from "@/ledger";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const books = await loadBooks();
  const requested = one(params.entity);
  const entity = books.entities.find((item) => item.id === requested) ?? books.entities[0];
  const parsed = parseDateRange(
    { from: one(params.from), to: one(params.to) },
    { from: books.period.start, to: books.period.end },
  );
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const scoped = sliceBooks(books, range);

  if (!entity) {
    return (
      <>
        <PageHeader kicker="Reports" title="Reports" description="Add an entity before a trial balance can be prepared." />
        <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No entities yet.</p>
      </>
    );
  }

  const balance = trialBalance(scoped.journalEntries, books.accounts, entity.id);
  const carrying = assetCarryingSchedule(scoped.journalEntries, books.accounts, entity.id);
  const balanced = balance.debitTotal === balance.creditTotal;
  const assetBars = reportAssetBars(entity.id, scoped);
  const composition = reportComposition(entity.id, scoped);
  const exportQuery = `entity=${encodeURIComponent(entity.id)}&from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader
        kicker={`${range.from} – ${range.to} · ${entity.reportingFramework}`}
        title="Reports"
        description="Trial balance and digital-asset carrying amounts for one entity. The consolidated group view is a separate page. Download the same figures as CSV."
      />
      {!parsed.ok ? (
        <p role="alert" className="mb-6 text-sm text-seal">
          {parsed.message}
        </p>
      ) : null}
      <nav aria-label="Reporting entity" className="mb-6 flex flex-wrap gap-2">
        {books.entities.map((item) => {
          const current = item.id === entity.id;
          return (
            <Link
              key={item.id}
              href={`/dashboard/reports?entity=${item.id}&from=${range.from}&to=${range.to}`}
              aria-current={current ? "page" : undefined}
              className={`border px-3 py-2 text-sm ${current ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised"}`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <PeriodForm path="/dashboard/reports" range={range} hidden={{ entity: entity.id }} />

      <div className="mb-8 flex flex-wrap gap-2">
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=trial-balance&${exportQuery}`}>
          Trial balance CSV
        </a>
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=journal&${exportQuery}`}>
          Journal CSV
        </a>
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=reconciliation&${exportQuery}`}>
          Reconciliation CSV
        </a>
      </div>

      <div className="mb-8 grid gap-4 xl:grid-cols-2">
        {assetBars.length > 0 ? (
          <ChartFrame
            title={`Carrying value · ${entity.functionalCurrency}`}
            description="Same amounts as the schedule below, for this entity and period."
            rows={assetBars.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={assetBars} currency={entity.functionalCurrency} />
          </ChartFrame>
        ) : (
          <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No digital-asset carrying amounts in this period.</p>
        )}
        {composition.length > 0 ? (
          <ChartFrame
            title="Asset accounts"
            description="Net balance of asset accounts with activity in this period."
            rows={composition.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={composition} currency={entity.functionalCurrency} />
          </ChartFrame>
        ) : (
          <p className="border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">No asset-account activity in this period.</p>
        )}
      </div>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl">Trial balance</h2>
          <p className={balanced ? "text-sm text-pine" : "text-sm text-seal"}>
            {balance.rows.length === 0 ? "No accounts" : balanced ? "Debits equal credits" : "Out of balance"}
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
              {balance.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No accounts on this entity.</td>
                </tr>
              ) : (
                balance.rows.map((row) => (
                  <tr key={row.code}>
                    <td className="num text-left">{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.measurementBasis ?? "—"}</td>
                    <td className="num">{balance.currency && row.debitMinor > 0n ? formatMoney(row.debitMinor, balance.currency) : ""}</td>
                    <td className="num">{balance.currency && row.creditMinor > 0n ? formatMoney(row.creditMinor, balance.currency) : ""}</td>
                    <td className="num">{balance.currency ? formatMoney(netBalanceMinor(row), balance.currency) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Digital asset carrying amounts</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Grouped by the measurement basis on the account. IAS 38, IAS 2, and IFRS 9 labels are illustrative, not a policy election.
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
                    <td className="num">{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</td>
                    <td className="num">{formatMoney(row.carryingMinor, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">{books.notice}</p>
    </>
  );
}
