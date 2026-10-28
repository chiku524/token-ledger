import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { StatCard } from "@/components/app/stat-card";
import { NumberCell, NumberHead } from "@/components/app/table-cells";
import { TableCard } from "@/components/app/table-card";
import { ChartFrame } from "@/components/charts/frame";
import { GainLossBars, GainLossLine } from "@/components/charts/lazy";
import { Stagger } from "@/components/motion/stagger";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
}: {
  gainLoss: GainLoss;
  id?: string;
  action?: React.ReactNode;
  className?: string;
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