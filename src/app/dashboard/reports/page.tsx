import Link from "next/link";
import { Building2, Download, FileSpreadsheet, Calendar } from "lucide-react";
import { MoneyBars } from "@/components/charts/lazy";
import { ChartFrame } from "@/components/charts/frame";
import { RevaluationForm } from "@/components/record-forms";
import { ensureCsrf } from "@/auth/current";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { can } from "@/auth/roles";
import { canRevalue, entityReport } from "@/data/entity-report";
import { loadAuthorizedBooks } from "@/data/authorized-books";
import { parseDateRange } from "@/data/period";
import { one } from "@/data/query";
import { formatMoney, formatQuantity, valuationLabel } from "@/data/present";
import { netBalanceMinor } from "@/ledger";
import { FinancialStatementsCards } from "@/components/app/financial-statements";
import { requireSectionAccess } from "@/data/section-access";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string | string[];
    from?: string | string[];
    to?: string | string[];
    error?: string | string[];
    saved?: string | string[];
  }>;
}) {
  const params = await searchParams;
  await requireSectionAccess("/dashboard/reports");
  const { session, books } = await loadAuthorizedBooks();
  const requested = one(params.entity);
  const entity = books.entities.find((item) => item.id === requested) ?? books.entities[0];
  const parsed = parseDateRange(
    { from: one(params.from), to: one(params.to) },
    { from: books.period.start, to: books.period.end },
  );
  const range = parsed.ok ? parsed.range : { from: books.period.start, to: books.period.end };

  if (!entity) {
    return (
      <>
        <PageHeader kicker="Reports" title="Reports" description="Add a company before balances can be prepared." />
        <EmptyState
          icon={Building2}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard/entities">Companies</Link>
            </Button>
          }
        >
          No companies yet.
        </EmptyState>
      </>
    );
  }

  const { balance, balanced, statements, carrying, assetBars, composition, revaluation } = entityReport({
    books,
    entityId: entity.id,
    range,
    includeRevaluation: canRevalue(session),
  });
  const exportQuery = `entity=${encodeURIComponent(entity.id)}&from=${range.from}&to=${range.to}`;

  const moreExports: [string, string, React.ComponentType<{ className?: string }>][] = [
    ["trial-balance", "Balances", FileSpreadsheet],
    ["journal", "Journal", FileSpreadsheet],
    ["reconciliation", "Matching", FileSpreadsheet],
  ];

  return (
    <>
      {/* ── Minimal header ──────────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entity.name} · {entity.reportingFramework}
        </p>
      </header>

      <Flash error={one(params.error) ?? (parsed.ok ? undefined : parsed.message)} saved={one(params.saved)} />

      {/* ── Controls toolbar ────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        {/* Left: entity picker + date range */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          {/* Entity picker */}
          {books.entities.length > 1 && (
            <nav aria-label="Company" className="flex flex-wrap items-center gap-1">
              {books.entities.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/reports?entity=${item.id}&from=${range.from}&to=${range.to}`}
                  aria-current={item.id === entity.id ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    item.id === entity.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          )}

          {/* Date range */}
          <form method="get" action="/dashboard/reports" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="entity" value={entity.id} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" />
              <Input type="date" name="from" aria-label="From date" defaultValue={range.from} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
              <span className="text-muted-foreground/60">—</span>
              <Input type="date" name="to" aria-label="To date" defaultValue={range.to} required className="h-8 w-28 min-w-0 text-xs sm:w-[130px]" />
            </div>
            <SubmitButton variant="ghost" size="sm">Update</SubmitButton>
          </form>
        </div>

        {/* Right: one primary export; the rest stay available but quieter */}
        {can(session.role, "books.export") ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 sm:border-0 sm:pt-0">
            <Button asChild variant="outline" size="sm">
              <a href={`/dashboard/reports/export?kind=pdf&${exportQuery}`} className="gap-1.5">
                <Download className="size-3.5" />
                PDF
              </a>
            </Button>
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                More exports
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {moreExports.map(([kind, label, Icon]) => (
                  <Button key={kind} asChild variant="ghost" size="sm">
                    <a href={`/dashboard/reports/export?kind=${kind}&${exportQuery}`} className="gap-1.5">
                      <Icon className="size-3.5" />
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <section className="mb-8">
        <SectionHeader
          title="Financial statements"
          description="The Balance Sheet groups assets by kind, and the Profit & Loss covers this company and these dates. The period result is carried into equity so the sheet balances."
        />
        <div className="mt-4">
          <FinancialStatementsCards statements={statements} company={entity.name} />
        </div>
      </section>

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
          <EmptyState>No crypto values in these dates.</EmptyState>
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
          <EmptyState>No account activity in these dates.</EmptyState>
        )}
      </div>

      <section>
        <SectionHeader
          title="Account balances"
          action={
            <StatusBadge tone={balance.rows.length === 0 ? "neutral" : balanced ? "success" : "danger"}>
              {balance.rows.length === 0 ? "No accounts" : balanced ? "Debits equal credits" : "Out of balance"}
              {balance.currency ? ` · ${formatMoney(balance.debitTotal, balance.currency)}` : ""}
            </StatusBadge>
          }
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Account balances for {entity.name}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>What it holds</TableHead>
                <NumberHead>Debit</NumberHead>
                <NumberHead>Credit</NumberHead>
                <NumberHead>Net</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balance.rows.length === 0 ? (
                <EmptyRow colSpan={6}>No accounts for this company.</EmptyRow>
              ) : (
                balance.rows.map((row) => (
                  <TableRow key={row.code}>
                    <NumberCell align="left">{row.code}</NumberCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{valuationLabel(row.measurementBasis)}</TableCell>
                    <NumberCell>{balance.currency && row.debitMinor > 0n ? formatMoney(row.debitMinor, balance.currency) : ""}</NumberCell>
                    <NumberCell>{balance.currency && row.creditMinor > 0n ? formatMoney(row.creditMinor, balance.currency) : ""}</NumberCell>
                    <NumberCell>{balance.currency ? formatMoney(netBalanceMinor(row), balance.currency) : ""}</NumberCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section className="mt-10">
        <SectionHeader
          title="Crypto held"
          description={
            <>
              Booked value from <strong>posted journal entries</strong>, grouped by what the account is for: crypto, crypto
              held for sale, or stablecoins. Reading a wallet records an observed balance and does not post a journal, so a
              holding appears here only after it is journaled on the{" "}
              <Link href="/dashboard/ledger" className="text-link underline">
                Journal
              </Link>{" "}
              page. Observed balances are on{" "}
              <Link href="/dashboard/sources" className="text-link underline">
                Holdings
              </Link>
              .
            </>
          }
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Crypto held by {entity.name}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Held as</TableHead>
                <NumberHead>Amount</NumberHead>
                <NumberHead>Value</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carrying.length === 0 ? (
                <EmptyRow colSpan={4}>
                  No journaled crypto yet. A wallet Check records an observation on Holdings but does not post a journal;
                  post an entry on the Journal page to see it held here.
                </EmptyRow>
              ) : (
                carrying.map((row) => (
                  <TableRow key={`${row.measurementBasis}-${row.assetCode}`}>
                    <TableCell>{row.assetCode}</TableCell>
                    <TableCell>{valuationLabel(row.measurementBasis)}</TableCell>
                    <NumberCell>{formatQuantity(row.quantityMinor, row.assetCode, books.assets)}</NumberCell>
                    <NumberCell>{formatMoney(row.carryingMinor, row.currency)}</NumberCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      {revaluation ? (
        <section className="mt-10">
          <SectionHeader
            title={`Revaluation · ${entity.functionalCurrency}`}
            description={`Carrying value compared with the latest saved price. Posting records one balanced entry (gain or loss) for the net difference, with a reference so the price basis is visible. Nothing is posted automatically.${
              revaluation.staleAssetCodes.length > 0 ? " Some prices are stale; treat the proposal as provisional." : ""
            }`}
          />
          {revaluation.lines.length === 0 ? (
            <EmptyState className="mt-4">Nothing to revalue at these prices, or no priced holdings.</EmptyState>
          ) : (
            <>
              <TableCard>
                <Table>
                  <caption className="sr-only">Revaluation proposal for {entity.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <NumberHead>Carrying</NumberHead>
                      <NumberHead>Market</NumberHead>
                      <NumberHead>Difference</NumberHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revaluation.lines.map((line) => (
                      <TableRow key={line.assetCode}>
                        <TableCell>{line.assetCode}</TableCell>
                        <NumberCell>{formatMoney(line.carryingMinor, entity.functionalCurrency)}</NumberCell>
                        <NumberCell>{formatMoney(line.marketMinor, entity.functionalCurrency)}</NumberCell>
                        <NumberCell className={line.differenceMinor < 0n ? "text-danger" : "text-success"}>
                          {line.differenceMinor < 0n ? "−" : "+"}
                          {formatMoney(line.differenceMinor < 0n ? -line.differenceMinor : line.differenceMinor, entity.functionalCurrency)}
                        </NumberCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableHead scope="row">Net {revaluation.netMinor >= 0n ? "gain" : "loss"}</TableHead>
                      <TableCell colSpan={2} />
                      <NumberCell>{formatMoney(revaluation.netMinor < 0n ? -revaluation.netMinor : revaluation.netMinor, entity.functionalCurrency)}</NumberCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableCard>
              <RevaluationForm entityId={entity.id} asOf={range.to} csrf={await ensureCsrf()} />
            </>
          )}
          {revaluation.unpriced.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Not priced, so left out: {revaluation.unpriced.join(", ")}.</p>
          ) : null}
        </section>
      ) : null}

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{books.notice}</p>
    </>
  );
}
