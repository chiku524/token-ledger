import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
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
import { requireSectionAccess } from "@/data/section-access";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  await requireSectionAccess("/dashboard/consolidation");
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Combined</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {books.organization.name} · {presentation}
        </p>
      </header>

      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />

      <div className="mb-8 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          {/* Currency picker */}
          {currencies.length > 1 && (
            <nav aria-label="Currency" className="flex flex-wrap items-center gap-1">
              {currencies.map((currency) => (
                <Link
                  key={currency}
                  href={`/dashboard/consolidation?currency=${currency}&from=${range.from}&to=${range.to}`}
                  aria-current={currency === presentation ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    currency === presentation
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {currency}
                </Link>
              ))}
            </nav>
          )}

          <form method="get" action="/dashboard/consolidation" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="currency" value={presentation} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" />
              <Input type="date" name="from" aria-label="From date" defaultValue={range.from} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
              <span className="text-muted-foreground/60">—</span>
              <Input type="date" name="to" aria-label="To date" defaultValue={range.to} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
            </div>
            <SubmitButton variant="ghost" size="sm">Update</SubmitButton>
          </form>
        </div>
      </div>

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
