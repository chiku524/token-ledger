import Link from "next/link";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { RevaluationForm } from "@/components/record-forms";
import { ensureCsrf } from "@/auth/current";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { reportAssetBars, reportComposition } from "@/data/charts";
import { can } from "@/auth/roles";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { revaluationForEntity } from "@/data/valuation";
import { booksAreWritable } from "@/data/load-books";
import { formatMoney, formatQuantity, valuationLabel } from "@/data/present";
import { assetCarryingSchedule, netBalanceMinor, trialBalance } from "@/ledger";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
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
        <PageHeader kicker="Reports" title="Reports" description="Add a company before balances can be prepared." />
        <p className="panel px-4 py-6 text-sm text-ink-soft">No companies yet.</p>
      </>
    );
  }

  const balance = trialBalance(scoped.journalEntries, books.accounts, entity.id);
  const carrying = assetCarryingSchedule(scoped.journalEntries, books.accounts, entity.id);
  const canPost = can(session.role, "journal.post") && booksAreWritable() && !session.demo;
  const revaluation = canPost
    ? revaluationForEntity({
        entries: books.journalEntries,
        accounts: books.accounts,
        assets: books.assets,
        prices: books.assetPrices,
        entityId: entity.id,
        quoteCurrency: entity.functionalCurrency,
        assetAccountCode: "1310",
        gainAccountCode: "4200",
        lossAccountCode: "5200",
        asOf: range.to,
      })
    : null;
  const balanced = balance.debitTotal === balance.creditTotal;
  const assetBars = reportAssetBars(entity.id, scoped);
  const composition = reportComposition(entity.id, scoped);
  const exportQuery = `entity=${encodeURIComponent(entity.id)}&from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader
        kicker={`${range.from} – ${range.to} · ${entity.reportingFramework}`}
        title="Reports"
        description="Account balances and crypto values for one company. The combined view is a separate page. Download the same figures as CSV."
      />
      {!parsed.ok ? (
        <p role="alert" className="mb-6 text-sm text-seal">
          {parsed.message}
        </p>
      ) : null}
      <nav aria-label="Company" className="mb-6 flex flex-wrap gap-2">
        {books.entities.map((item) => {
          const current = item.id === entity.id;
          return (
            <Link
              key={item.id}
              href={`/dashboard/reports?entity=${item.id}&from=${range.from}&to=${range.to}`}
              aria-current={current ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm ${current ? "border-transparent bg-lime text-on-lime" : "border-line bg-paper-raised"}`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <PeriodForm path="/dashboard/reports" range={range} hidden={{ entity: entity.id }} />

      {can(session.role, "books.export") ? (
      <div className="mb-8 flex flex-wrap gap-2">
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=trial-balance&${exportQuery}`}>
          Balances CSV
        </a>
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=journal&${exportQuery}`}>
          Journal CSV
        </a>
        <a className="btn-secondary" href={`/dashboard/reports/export?kind=reconciliation&${exportQuery}`}>
          Matching CSV
        </a>
      </div>
      ) : null}

      <div className="mb-8 grid gap-4 xl:grid-cols-2">
        {assetBars.length > 0 ? (
          <ChartFrame
            title={`Value · ${entity.functionalCurrency}`}
            description="Same amounts as the crypto table below, for this company and these dates."
            rows={assetBars.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={assetBars} currency={entity.functionalCurrency} />
          </ChartFrame>
        ) : (
          <p className="panel px-4 py-6 text-sm text-ink-soft">No crypto values in these dates.</p>
        )}
        {composition.length > 0 ? (
          <ChartFrame
            title="Accounts"
            description="Cash, crypto, and stablecoins with activity in these dates."
            rows={composition.map((row) => ({ label: row.label, detail: row.formatted }))}
          >
            <MoneyBars rows={composition} currency={entity.functionalCurrency} />
          </ChartFrame>
        ) : (
          <p className="panel px-4 py-6 text-sm text-ink-soft">No account activity in these dates.</p>
        )}
      </div>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Account balances</h2>
          <p className={balanced ? "text-sm text-pine" : "text-sm text-seal"}>
            {balance.rows.length === 0 ? "No accounts" : balanced ? "Debits equal credits" : "Out of balance"}
            {balance.currency ? ` · ${formatMoney(balance.debitTotal, balance.currency)}` : ""}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Account balances for {entity.name}</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Account</th>
                <th scope="col">What it holds</th>
                <th scope="col" className="num">Debit</th>
                <th scope="col" className="num">Credit</th>
                <th scope="col" className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {balance.rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No accounts for this company.</td>
                </tr>
              ) : (
                balance.rows.map((row) => (
                  <tr key={row.code}>
                    <td className="num text-left">{row.code}</td>
                    <td>{row.name}</td>
                    <td>{valuationLabel(row.measurementBasis)}</td>
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
        <h2 className="text-lg font-semibold tracking-tight">Crypto held</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Grouped by what the account is for: crypto, crypto held for sale, or stablecoins. The sample uses those labels as examples.
        </p>
        <div className="mt-4 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Crypto held by {entity.name}</caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Held as</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {carrying.length === 0 ? (
                <tr>
                  <td colSpan={4}>No crypto movements in these dates.</td>
                </tr>
              ) : (
                carrying.map((row) => (
                  <tr key={`${row.measurementBasis}-${row.assetCode}`}>
                    <td>{row.assetCode}</td>
                    <td>{valuationLabel(row.measurementBasis)}</td>
                    <td className="num">{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</td>
                    <td className="num">{formatMoney(row.carryingMinor, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {revaluation ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Revaluation · {entity.functionalCurrency}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Carrying value compared with the latest saved price. Posting records one balanced entry (gain or loss) for the
            net difference, with a reference so the price basis is visible. Nothing is posted automatically.
            {revaluation.staleAssetCodes.length > 0
              ? " Some prices are stale; treat the proposal as provisional."
              : ""}
          </p>
          {revaluation.lines.length === 0 ? (
            <p className="mt-4 panel px-4 py-6 text-sm text-ink-soft">
              Nothing to revalue at these prices, or no priced holdings.
            </p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto panel">
                <table className="ledger-table">
                  <caption className="sr-only">Revaluation proposal for {entity.name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col" className="num">Carrying</th>
                      <th scope="col" className="num">Market</th>
                      <th scope="col" className="num">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revaluation.lines.map((line) => (
                      <tr key={line.assetCode}>
                        <td>{line.assetCode}</td>
                        <td className="num">{formatMoney(line.carryingMinor, entity.functionalCurrency)}</td>
                        <td className="num">{formatMoney(line.marketMinor, entity.functionalCurrency)}</td>
                        <td className={`num ${line.differenceMinor < 0n ? "text-seal" : "text-pine"}`}>
                          {line.differenceMinor < 0n ? "−" : "+"}
                          {formatMoney(line.differenceMinor < 0n ? -line.differenceMinor : line.differenceMinor, entity.functionalCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Net {revaluation.netMinor >= 0n ? "gain" : "loss"}</th>
                      <td colSpan={2} />
                      <td className="num">{formatMoney(revaluation.netMinor < 0n ? -revaluation.netMinor : revaluation.netMinor, entity.functionalCurrency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <RevaluationForm entityId={entity.id} asOf={range.to} csrf={await ensureCsrf()} />
            </>
          )}
          {revaluation.unpriced.length > 0 ? (
            <p className="mt-3 text-sm text-ink-soft">Not priced, so left out: {revaluation.unpriced.join(", ")}.</p>
          ) : null}
        </section>
      ) : null}

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">{books.notice}</p>
    </>
  );
}
