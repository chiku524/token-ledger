import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { SegmentedLinks } from "@/components/app/segmented-links";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { ChartFrame } from "@/components/charts/frame";
import { GainLossBars, GainLossLine } from "@/components/charts/lazy";
import { Stagger } from "@/components/motion/stagger";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HOLDINGS_DISPLAY_CURRENCIES } from "@/data/display-currency";
import { REALIZED_COPY, realizedNotIncludedText, type RealizedGainLoss } from "@/data/realized-gain-loss";
import {
  directionOf,
  directionWord,
  gainLossBarRows,
  gainLossCopy,
  gainLossLinePoints,
  moneyText,
  notIncludedText,
  signedMoney,
  signedPercent,
  type GainLoss,
} from "@/data/gain-loss";

/**
 * Gain / loss for what is held: value now against cost (organizations) or against
 * what was put in (individuals). A line over time when prices allow it, otherwise a
 * bar per asset. Assets without the data are listed, never guessed.
 */
export function GainLossPanel({
  gainLoss,
  id,
  action,
  className,
  currencyHref,
  realized,
}: {
  gainLoss: GainLoss;
  id?: string;
  action?: React.ReactNode;
  className?: string;
  /** When set, a MYR / SGD / USD switcher is shown; each link goes to this address. */
  currencyHref?: (currency: string) => string;
  /** Organizations only: sales already made, shown after the unrealized figures. */
  realized?: RealizedGainLoss;
}) {
  const copy = gainLossCopy(gainLoss.basis);
  const { currency, totals } = gainLoss;
  const direction = directionOf(totals.gainMinor);
  const hasRows = gainLoss.rows.length > 0;
  const linePoints = gainLossLinePoints(gainLoss);
  const barRows = gainLossBarRows(gainLoss);
  const showLine = linePoints.length >= 2;
  const gainHint =
    totals.percent === null
      ? `${directionWord(totals.gainMinor)}, nothing to compare against`
      : `${directionWord(totals.gainMinor)}, ${signedPercent(totals.percent)} of ${copy.investedLabel.toLowerCase()}`;

  return (
    <section id={id} className={className} aria-label={copy.title}>
      <SectionHeader title={`${copy.title} \u00b7 ${currency}`} description={copy.description} action={action} />

      {currencyHref ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <p className="text-sm text-muted-foreground">Gain / loss currency</p>
          <SegmentedLinks
            label="Gain / loss currency"
            items={HOLDINGS_DISPLAY_CURRENCIES.map((code) => ({
              key: code,
              href: currencyHref(code),
              label: code,
              current: code === currency,
            }))}
          />
        </div>
      ) : null}

      {hasRows ? (
        <>
          <Stagger className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <StatCard label={copy.valueLabel} value={moneyText(totals.valueMinor, currency)} />
            <StatCard label={copy.investedLabel} value={moneyText(totals.investedMinor, currency)} />
            <StatCard
              label={copy.gainLabel}
              value={signedMoney(totals.gainMinor, currency)}
              tone={direction === "gain" ? "success" : direction === "loss" ? "danger" : undefined}
              hint={gainHint}
            />
          </Stagger>

          {gainLoss.stale ? (
            <Alert variant="warning" className="mt-4 max-w-2xl">
              Some prices are more than a day old, so these figures may have moved. Refresh prices for the latest.
            </Alert>
          ) : null}

          <div className="mt-4">
            {showLine ? (
              <ChartFrame
                title={copy.lineTitle}
                description={
                  gainLoss.skippedDays > 0
                    ? `Days without a recent price for every asset are left out (${gainLoss.skippedDays}).`
                    : "On each day a price was saved."
                }
                rows={linePoints.map((point) => ({
                  label: point.label,
                  detail: `${copy.valueLabel} ${point.valueText}, ${copy.investedLabel} ${point.investedText}, ${point.gainText}`,
                }))}
              >
                <GainLossLine
                  points={linePoints}
                  valueLabel={copy.valueLabel}
                  investedLabel={copy.investedLabel}
                  title={copy.lineTitle}
                />
              </ChartFrame>
            ) : (
              <ChartFrame
                title={copy.barsTitle}
                description="Not enough saved prices yet to draw a line over time, so this shows where each asset stands now."
                rows={barRows.map((row) => ({ label: row.label, detail: `${row.formatted}. ${row.detail}` }))}
              >
                <GainLossBars rows={barRows} currency={currency} />
              </ChartFrame>
            )}
          </div>

          <TableCard className="mt-4">
            <Table>
              <caption className="sr-only">{copy.barsTitle}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Asset</TableHead>
                  <NumberHead scope="col">{copy.valueLabel}</NumberHead>
                  <NumberHead scope="col">{copy.investedLabel}</NumberHead>
                  <NumberHead scope="col">{copy.gainLabel}</NumberHead>
                  <NumberHead scope="col">Change</NumberHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gainLoss.rows.map((row) => {
                  const rowDirection = directionOf(row.gainMinor);
                  return (
                    <TableRow key={row.assetCode}>
                      <TableCell>{row.assetCode}</TableCell>
                      <NumberCell>{moneyText(row.valueMinor, currency)}</NumberCell>
                      <NumberCell>{moneyText(row.investedMinor, currency)}</NumberCell>
                      <NumberCell className={rowDirection === "gain" ? "text-success" : rowDirection === "loss" ? "text-danger" : undefined}>
                        <span className="sr-only">{directionWord(row.gainMinor)} </span>
                        {signedMoney(row.gainMinor, currency)}
                      </NumberCell>
                      <NumberCell>{signedPercent(row.percent)}</NumberCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        </>
      ) : (
        <EmptyState className="mt-4" icon={TrendingUp}>
          <p className="font-medium text-foreground">{copy.emptyTitle}</p>
          <p className="mt-1">{copy.emptyMessage}</p>
        </EmptyState>
      )}

      {realized ? <RealizedBlock realized={realized} /> : null}

      {gainLoss.notIncluded.length > 0 ? (
        <div className="mt-4 max-w-2xl text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Left out of the totals</p>
          <ul className="mt-1 grid gap-1">
            {gainLoss.notIncluded.map((item) => (
              <li key={`${item.assetCode}-${item.reason}`}>
                <span className="font-mono text-foreground">{item.assetCode}</span> {notIncludedText(gainLoss.basis, item.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
function RealizedBlock({ realized }: { realized: RealizedGainLoss }) {
  const { currency, totals } = realized;
  const direction = directionOf(totals.gainMinor);
  const hasRows = realized.rows.length > 0;
  const hint = !hasRows
    ? REALIZED_COPY.emptyMessage
    : totals.percent === null
      ? `${directionWord(totals.gainMinor)}, nothing to compare against`
      : `${directionWord(totals.gainMinor)}, ${signedPercent(totals.percent)} of cost of units sold`;

  return (
    <div className="mt-8" role="group" aria-label={REALIZED_COPY.title}>
      <h3 className="text-base font-semibold text-foreground">
        {REALIZED_COPY.title} {"\u00b7"} {currency}
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{REALIZED_COPY.description}</p>

      <Stagger className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        <StatCard label={REALIZED_COPY.proceedsLabel} value={moneyText(totals.proceedsMinor, currency)} />
        <StatCard label={REALIZED_COPY.costLabel} value={moneyText(totals.costMinor, currency)} />
        <StatCard
          label={REALIZED_COPY.gainLabel}
          value={signedMoney(totals.gainMinor, currency)}
          tone={hasRows ? (direction === "gain" ? "success" : direction === "loss" ? "danger" : undefined) : undefined}
          hint={hint}
        />
      </Stagger>

      {hasRows ? (
        <TableCard className="mt-4">
          <Table>
            <caption className="sr-only">{REALIZED_COPY.gainLabel} by asset</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Asset</TableHead>
                <NumberHead scope="col">Sales</NumberHead>
                <NumberHead scope="col">{REALIZED_COPY.proceedsLabel}</NumberHead>
                <NumberHead scope="col">{REALIZED_COPY.costLabel}</NumberHead>
                <NumberHead scope="col">{REALIZED_COPY.gainLabel}</NumberHead>
                <NumberHead scope="col">Change</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {realized.rows.map((row) => {
                const rowDirection = directionOf(row.gainMinor);
                return (
                  <TableRow key={row.assetCode}>
                    <TableCell>{row.assetCode}</TableCell>
                    <NumberCell>{row.sales}</NumberCell>
                    <NumberCell>{moneyText(row.proceedsMinor, currency)}</NumberCell>
                    <NumberCell>{moneyText(row.costMinor, currency)}</NumberCell>
                    <NumberCell className={rowDirection === "gain" ? "text-success" : rowDirection === "loss" ? "text-danger" : undefined}>
                      <span className="sr-only">{directionWord(row.gainMinor)} </span>
                      {signedMoney(row.gainMinor, currency)}
                    </NumberCell>
                    <NumberCell>{signedPercent(row.percent)}</NumberCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      ) : null}

      {realized.notIncluded.length > 0 ? (
        <div className="mt-4 max-w-2xl text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{REALIZED_COPY.leftOutTitle}</p>
          <ul className="mt-1 grid gap-1">
            {realized.notIncluded.map((item) => (
              <li key={`${item.assetCode}-${item.reason}`}>
                <span className="font-mono text-foreground">{item.assetCode}</span> {realizedNotIncludedText(item.reason, item.sales)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
