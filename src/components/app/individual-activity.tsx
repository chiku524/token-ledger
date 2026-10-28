import type { ActivityHistory, ActivityRow } from "@/data/individual-reports";
import { NumberCell, NumberHead, EmptyRow } from "@/components/app/table-cells";
import { SectionHeader } from "@/components/app/section-header";
import { TableCard } from "@/components/app/table-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Rows drawn per table. The download holds every row. */
export const ACTIVITY_ROW_LIMIT = 200;

function Rows({ rows, columns }: { rows: ActivityRow[]; columns: "transactions" | "changes" }) {
  return (
    <>
      {rows.slice(0, ACTIVITY_ROW_LIMIT).map((row) => (
        <TableRow key={`${row.type}-${row.id}`}>
          <NumberCell align="left">{row.date}</NumberCell>
          {columns === "transactions" ? <TableCell>{row.type}</TableCell> : null}
          <TableCell>{row.assetCode}</TableCell>
          <NumberCell className={row.quantityMinor < 0n ? "text-danger" : "text-success"}>{row.amount}</NumberCell>
          <TableCell>{row.source}</TableCell>
          <TableCell className="whitespace-normal text-muted-foreground">{row.note}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

/**
 * What moved and how balances changed, read from connected wallets and
 * exchanges. Read-only: there is nothing to record or correct here.
 */
export function IndividualActivityTables({ history, emptyHint }: { history: ActivityHistory; emptyHint: string }) {
  const { transactions, balanceChanges } = history;
  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="Transactions"
          description="Money in and out of your wallets and exchanges, newest first."
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Transactions</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Asset</TableHead>
                <NumberHead scope="col">Amount</NumberHead>
                <TableHead scope="col">Account/Source</TableHead>
                <TableHead scope="col">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <EmptyRow colSpan={6}>{emptyHint}</EmptyRow>
              ) : (
                <Rows rows={transactions} columns="transactions" />
              )}
            </TableBody>
          </Table>
        </TableCard>
        {transactions.length > ACTIVITY_ROW_LIMIT ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing the latest {ACTIVITY_ROW_LIMIT} of {transactions.length}. Download the activity history to get every row.
          </p>
        ) : null}
      </section>

      <section>
        <SectionHeader
          title="Balance changes"
          description="How the balance in each account moved between checks."
        />
        <TableCard>
          <Table>
            <caption className="sr-only">Balance changes</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Date</TableHead>
                <TableHead scope="col">Asset</TableHead>
                <NumberHead scope="col">Change</NumberHead>
                <TableHead scope="col">Account/Source</TableHead>
                <TableHead scope="col">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceChanges.length === 0 ? (
                <EmptyRow colSpan={5}>No balance changes in these dates.</EmptyRow>
              ) : (
                <Rows rows={balanceChanges} columns="changes" />
              )}
            </TableBody>
          </Table>
        </TableCard>
        {balanceChanges.length > ACTIVITY_ROW_LIMIT ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing the latest {ACTIVITY_ROW_LIMIT} of {balanceChanges.length}. Download the activity history to get every row.
          </p>
        ) : null}
      </section>
    </div>
  );
}
