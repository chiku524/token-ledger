import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PeriodForm } from "@/components/period-form";
import { ensureCsrf } from "@/auth/current";
import { can } from "@/auth/roles";
import { FxRateForm, ReadOnlyNote } from "@/components/record-forms";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { booksAreWritable } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { sliceBooks } from "@/data/slice-books";
import { formatMoney } from "@/data/present";
import { consolidateTrialBalances, formatFxRate, formatInverseRate } from "@/ledger";

export const metadata = { title: "Combined" };

export default async function ConsolidationPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, books } = await loadAuthorizedBooks();
  const canFx = can(session.role, "fx.write");
  const parent = books.entities.find((entity) => entity.parentEntityId === null) ?? books.entities[0];
  const currencies = [...new Set(books.entities.map((entity) => entity.functionalCurrency))];
  const requested = one(params.currency);
  const presentation = currencies.includes(requested ?? "") ? (requested as string) : parent?.functionalCurrency ?? currencies[0] ?? "MYR";
  const parsed = parseDateRange(
    { from: one(params.from), to: one(params.to) },
    { from: books.period.start, to: books.period.end },
  );
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };
  const scoped = sliceBooks(books, range);
  const group = consolidateTrialBalances({
    entities: books.entities,
    entries: scoped.journalEntries,
    accounts: books.accounts,
    rates: books.fxRates,
    presentationCurrency: presentation,
    asOf: range.to,
  });

  return (
    <>
      <PageHeader
        kicker={books.organization.name}
        title="Combined"
        description="Each company keeps its own currency until this page. Amounts are converted with the saved rate on or before the end date. Sample rates are not a market price."
      />
      {!parsed.ok ? (
        <p role="alert" className="mb-6 text-sm text-seal">
          {parsed.message}
        </p>
      ) : null}
      <nav aria-label="Currency" className="mb-6 flex flex-wrap gap-2">
        {currencies.map((currency) => {
          const current = currency === presentation;
          return (
            <Link
              key={currency}
              href={`/dashboard/consolidation?currency=${currency}&from=${range.from}&to=${range.to}`}
              aria-current={current ? "page" : undefined}
              className={`border px-3 py-2 text-sm ${current ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised"}`}
            >
              Show in {currency}
            </Link>
          );
        })}
      </nav>
      <PeriodForm path="/dashboard/consolidation" range={range} hidden={{ currency: presentation }} />

      <section>
        <h2 className="font-serif text-2xl">Rates</h2>
        {books.fxRates.length === 0 ? (
          <p className="mt-4 border border-line bg-paper-raised px-4 py-6 text-sm text-ink-soft">
            No exchange rates are saved, so only companies already in {presentation} can be included.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
            <table className="ledger-table">
              <caption className="sr-only">Saved exchange rates</caption>
              <thead>
                <tr>
                  <th scope="col">Rate</th>
                  <th scope="col">As of</th>
                  <th scope="col">Origin</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {books.fxRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      {formatFxRate(rate)}
                      <span className="mt-1 block text-xs text-ink-soft">{formatInverseRate(rate)} · exact inverse</span>
                    </td>
                    <td className="num text-left">{rate.asOf}</td>
                    <td className="capitalize">{rate.origin}</td>
                    <td>{rate.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canFx ? (
          <>
            {booksAreWritable() && !session.demo ? null : <ReadOnlyNote demo={session.demo} />}
            <FxRateForm csrf={await ensureCsrf()} defaultDate={range.to} />
          </>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Companies in this view</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {group.entities.map((entity) => (
            <li key={entity.entityId} className="border border-line bg-paper-raised p-4">
              <p className="font-medium">{entity.entityName}</p>
              <p className={`mt-1 text-sm ${entity.included ? "text-pine" : "text-seal"}`}>
                {entity.included ? "Included" : "Left out"} · {entity.functionalCurrency}
              </p>
              <p className="mt-2 text-sm text-ink-soft">{entity.rateLabel}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl">Combined balances · {presentation}</h2>
          <p className="text-sm text-pine">
            Debits equal credits
            {group.rows.length > 0 ? ` · ${formatMoney(group.debitTotal, presentation)}` : ""}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto border border-line bg-paper-raised">
          <table className="ledger-table">
            <caption className="sr-only">Combined balances in {presentation}</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Account</th>
                <th scope="col" className="num">Debit</th>
                <th scope="col" className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>Nothing to combine for these dates.</td>
                </tr>
              ) : (
                group.rows.map((row) => (
                  <tr key={row.code}>
                    <td className="num text-left">{row.code}</td>
                    <td>{row.name}</td>
                    <td className="num">{row.debitMinor > 0n ? formatMoney(row.debitMinor, presentation) : ""}</td>
                    <td className="num">{row.creditMinor > 0n ? formatMoney(row.creditMinor, presentation) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
