import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { SegmentedLinks } from "@/components/app/segmented-links";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { consolidateTrialBalances, formatFxRate, formatInverseRate, translateGroupIas21 } from "@/ledger";

export const metadata = { title: "Combined" };

export default async function ConsolidationPage({
  searchParams,
}: {
  searchParams: Promise<{
    currency?: string | string[];
    from?: string | string[];
    to?: string | string[];
    error?: string | string[];
    saved?: string | string[];
  }>;
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
  const ias21 = translateGroupIas21({
    entities: books.entities,
    entries: scoped.journalEntries,
    accounts: books.accounts,
    rates: books.fxRates,
    periodStart: range.from,
    closingDate: range.to,
    presentationCurrency: presentation,
  });

  return (
    <>
      <PageHeader
        kicker={books.organization.name}
        title="Combined"
        description="Each company keeps its own currency until this page. Amounts are converted with the saved rate on or before the end date. Sample rates are not a market price."
      />
      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />
      <SegmentedLinks
        label="Currency"
        className="mb-6"
        items={currencies.map((currency) => ({
          key: currency,
          href: `/dashboard/consolidation?currency=${currency}&from=${range.from}&to=${range.to}`,
          label: `Show in ${currency}`,
          current: currency === presentation,
        }))}
      />
      <PeriodForm path="/dashboard/consolidation" range={range} hidden={{ currency: presentation }} />

      <section>
        <SectionHeader title="Rates" />
        {books.fxRates.length === 0 ? (
          <EmptyState className="mt-4">
            No exchange rates are saved, so only companies already in {presentation} can be included.
          </EmptyState>
        ) : (
          <TableCard>
            <Table>
              <caption className="sr-only">Saved exchange rates</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate</TableHead>
                  <TableHead>As of</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.fxRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatFxRate(rate)}
                      <span className="mt-1 block text-xs text-muted-foreground">{formatInverseRate(rate)} · exact inverse</span>
                    </TableCell>
                    <NumberCell align="left">{rate.asOf}</NumberCell>
                    <TableCell className="capitalize">{rate.origin}</TableCell>
                    <TableCell className="min-w-56">{rate.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
        {canFx ? (
          <>
            {booksAreWritable() && !session.demo ? null : <ReadOnlyNote demo={session.demo} />}
            <FxRateForm csrf={await ensureCsrf()} defaultDate={range.to} />
          </>
        ) : null}
      </section>

      <section className="mt-8">
        <SectionHeader title="Companies in this view" />
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {group.entities.map((entity) => (
            <li key={entity.entityId}>
              <Card>
                <CardContent>
                  <p className="font-medium">{entity.entityName}</p>
                  <p className="mt-2">
                    <StatusBadge tone={entity.included ? "success" : "danger"}>
                      {entity.included ? "Included" : "Left out"} · {entity.functionalCurrency}
                    </StatusBadge>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{entity.rateLabel}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <SectionHeader
          title={`Combined balances · ${presentation}`}
          action={
            <StatusBadge tone="success">
              Debits equal credits
              {group.rows.length > 0 ? ` · ${formatMoney(group.debitTotal, presentation)}` : ""}
            </StatusBadge>
          }
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Combined balances in {presentation}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <NumberHead>Debit</NumberHead>
                <NumberHead>Credit</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.length === 0 ? (
                <EmptyRow colSpan={4}>Nothing to combine for these dates.</EmptyRow>
              ) : (
                group.rows.map((row) => (
                  <TableRow key={row.code}>
                    <NumberCell align="left">{row.code}</NumberCell>
                    <TableCell>{row.name}</TableCell>
                    <NumberCell>{row.debitMinor > 0n ? formatMoney(row.debitMinor, presentation) : ""}</NumberCell>
                    <NumberCell>{row.creditMinor > 0n ? formatMoney(row.creditMinor, presentation) : ""}</NumberCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section className="mt-10">
        <SectionHeader
          title={`IAS 21 translation · ${presentation}`}
          description={`Assets and liabilities at the closing rate (${range.to}), income and expense at the average rate (${range.from}), with the difference booked to a translation reserve. The reserve is derived here, not stored.`}
        />
        {ias21.entities.some((entity) => !entity.included) ? (
          <Alert variant="destructive" className="mt-3 max-w-2xl">
            {ias21.entities.filter((entity) => !entity.included).map((entity) => `${entity.entityName}: ${entity.detail}`).join(" ")}
          </Alert>
        ) : null}
        <TableCard>
          <Table>
            <caption className="sr-only">IAS 21 translated balances in {presentation}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <NumberHead>Debit</NumberHead>
                <NumberHead>Credit</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ias21.rows.length === 0 ? (
                <EmptyRow colSpan={4}>Nothing to translate, or a rate is missing.</EmptyRow>
              ) : (
                ias21.rows.map((row) => (
                  <TableRow key={`ias21_${row.code}`}>
                    <NumberCell align="left">{row.code}</NumberCell>
                    <TableCell>{row.name}</TableCell>
                    <NumberCell>{row.debitMinor > 0n ? formatMoney(row.debitMinor, presentation) : ""}</NumberCell>
                    <NumberCell>{row.creditMinor > 0n ? formatMoney(row.creditMinor, presentation) : ""}</NumberCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {ias21.rows.length > 0 ? (
              <TableFooter>
                <TableRow>
                  <TableHead scope="row" colSpan={2}>
                    Debits equal credits
                  </TableHead>
                  <NumberCell>{formatMoney(ias21.debitTotal, presentation)}</NumberCell>
                  <NumberCell>{formatMoney(ias21.creditTotal, presentation)}</NumberCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </TableCard>
      </section>
    </>
  );
}
