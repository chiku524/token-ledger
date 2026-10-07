import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, NumberCell, NumberHead } from "@/components/app/table-cells";
import { StatusBadge } from "@/components/app/status-badge";
import { formatMoney } from "@/data/present";
import type { FinancialStatements } from "@/ledger";

/**
 * A presented Balance Sheet and Profit & Loss for one company. Pure presentation
 * over the ledger's `financialStatements`, so the Overview and Reports show the
 * same figures. The sheet balances because the period result is shown in equity.
 */
export function FinancialStatementsCards({
  statements,
  company,
}: {
  statements: FinancialStatements;
  company: string;
}) {
  const currency = statements.currency;
  const money = (amount: bigint) => (currency ? formatMoney(amount, currency) : "—");
  const { balanceSheet, profitAndLoss } = statements;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-0 py-0">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold tracking-tight">Balance Sheet · {company}</h3>
            <StatusBadge tone={balanceSheet.inBalance ? "success" : "danger"}>
              {currency ? `${currency} · ` : ""}
              {balanceSheet.inBalance ? "In balance" : "Out of balance"}
            </StatusBadge>
          </div>
          <Table>
            <caption className="sr-only">Balance Sheet for {company}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <NumberHead>Amount</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceSheet.assetClassRows.length === 0 && balanceSheet.otherAssetRows.length === 0 ? (
                <EmptyRow colSpan={2}>No assets booked yet.</EmptyRow>
              ) : (
                <>
                  <GroupRow label="Assets" />
                  {balanceSheet.assetClassRows.map((row) => (
                    <TableRow key={`asset-${row.key}`}>
                      <TableCell className="pl-6">{row.label}</TableCell>
                      <NumberCell>{money(row.amountMinor)}</NumberCell>
                    </TableRow>
                  ))}
                  {balanceSheet.otherAssetRows.map((row) => (
                    <TableRow key={`other-${row.key}`}>
                      <TableCell className="pl-6">{row.label}</TableCell>
                      <NumberCell>{money(row.amountMinor)}</NumberCell>
                    </TableRow>
                  ))}
                  <TotalRow label="Total assets" amount={money(balanceSheet.assetTotalMinor)} />
                </>
              )}
              {balanceSheet.liabilityRows.length > 0 ? (
                <>
                  <GroupRow label="Liabilities" />
                  {balanceSheet.liabilityRows.map((row) => (
                    <TableRow key={`liability-${row.key}`}>
                      <TableCell className="pl-6">{row.label}</TableCell>
                      <NumberCell>{money(row.amountMinor)}</NumberCell>
                    </TableRow>
                  ))}
                  <TotalRow label="Total liabilities" amount={money(balanceSheet.liabilityTotalMinor)} />
                </>
              ) : null}
              <GroupRow label="Equity" />
              {balanceSheet.equityRows.map((row) => (
                <TableRow key={`equity-${row.key}`}>
                  <TableCell className="pl-6">{row.label}</TableCell>
                  <NumberCell>{money(row.amountMinor)}</NumberCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="pl-6">Result for the period</TableCell>
                <NumberCell>{money(balanceSheet.resultMinor)}</NumberCell>
              </TableRow>
              <TotalRow label="Total equity" amount={money(balanceSheet.equityTotalMinor)} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold tracking-tight">Profit &amp; Loss · {company}</h3>
            <StatusBadge tone={profitAndLoss.netMinor >= 0n ? "success" : "danger"}>
              {profitAndLoss.netMinor >= 0n ? "Profit" : "Loss"} {money(profitAndLoss.netMinor < 0n ? -profitAndLoss.netMinor : profitAndLoss.netMinor)}
            </StatusBadge>
          </div>
          <Table>
            <caption className="sr-only">Profit and Loss for {company}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <NumberHead>Amount</NumberHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profitAndLoss.incomeRows.length === 0 && profitAndLoss.expenseRows.length === 0 ? (
                <EmptyRow colSpan={2}>No income or expenses in this period.</EmptyRow>
              ) : (
                <>
                  <GroupRow label="Income" />
                  {profitAndLoss.incomeRows.map((row) => (
                    <TableRow key={`income-${row.key}`}>
                      <TableCell className="pl-6">{row.label}</TableCell>
                      <NumberCell>{money(row.amountMinor)}</NumberCell>
                    </TableRow>
                  ))}
                  <TotalRow label="Total income" amount={money(profitAndLoss.incomeTotalMinor)} />
                  <GroupRow label="Expenses" />
                  {profitAndLoss.expenseRows.map((row) => (
                    <TableRow key={`expense-${row.key}`}>
                      <TableCell className="pl-6">{row.label}</TableCell>
                      <NumberCell>{money(row.amountMinor)}</NumberCell>
                    </TableRow>
                  ))}
                  <TotalRow label="Total expenses" amount={money(profitAndLoss.expenseTotalMinor)} />
                  <TotalRow
                    label="Result for the period"
                    amount={money(profitAndLoss.netMinor)}
                    tone={profitAndLoss.netMinor < 0n ? "danger" : "default"}
                  />
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={2} className="pt-4 label-caps">
        {label}
      </TableCell>
    </TableRow>
  );
}

function TotalRow({ label, amount, tone }: { label: string; amount: string; tone?: "danger" | "default" }) {
  return (
    <TableRow className={tone === "danger" ? "text-danger" : undefined}>
      <TableCell className="font-medium">{label}</TableCell>
      <NumberCell className="font-medium">{amount}</NumberCell>
    </TableRow>
  );
}
