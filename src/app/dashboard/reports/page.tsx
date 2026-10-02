import Link from "next/link";
import { Building2 } from "lucide-react";
import { MoneyBars } from "@/components/charts/charts";
import { ChartFrame } from "@/components/charts/frame";
import { RevaluationForm } from "@/components/record-forms";
import { ensureCsrf } from "@/auth/current";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { SegmentedLinks } from "@/components/app/segmented-links";
import { StatusBadge } from "@/components/app/status-badge";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Flash error={parsed.ok ? undefined : parsed.message} />
      <SegmentedLinks
        label="Company"
        className="mb-6"
        items={books.entities.map((item) => ({
          key: item.id,
          href: `/dashboard/reports?entity=${item.id}&from=${range.from}&to=${range.to}`,
          label: item.name,
          current: item.id === entity.id,
        }))}
      />
      <PeriodForm path="/dashboard/reports" range={range} hidden={{ entity: entity.id }} />

      {can(session.role, "books.export") ? (
        <div className="mb-8 flex flex-wrap gap-2">
          {[
            ["trial-balance", "Balances CSV"],
            ["journal", "Journal CSV"],
            ["reconciliation", "Matching CSV"],
          ].map(([kind, label]) => (
            <Button key={kind} asChild variant="secondary">
              <a href={`/dashboard/reports/export?kind=${kind}&${exportQuery}`}>{label}</a>
            </Button>
          ))}
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
                <TableRow>
                  <TableCell colSpan={6}>No accounts for this company.</TableCell>
                </TableRow>
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
                <TableRow>
                  <TableCell colSpan={4}>
                    No journaled crypto yet. A wallet Check records an observation on Holdings but does not post a journal;
                    post an entry on the Journal page to see it held here.
                  </TableCell>
                </TableRow>
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
                      <TableHead>Net {revaluation.netMinor >= 0n ? "gain" : "loss"}</TableHead>
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
