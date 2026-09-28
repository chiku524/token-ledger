import { PageHeader } from "@/components/page-header";
import { EXAMPLE_PERIOD, exampleBooks, exampleReconciliations, exampleSourceTransactions } from "@/data/example-books";
import { formatQuantity, sourceName } from "@/data/present";

export const metadata = { title: "Reconciliation" };

export default function ReconciliationPage() {
  const ordered = [...exampleReconciliations].sort((a, b) => {
    if (a.status !== b.status) return a.status === "exception" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const externalId = new Map(exampleSourceTransactions.map((transaction) => [transaction.id, transaction.externalId]));

  return (
    <>
      <PageHeader
        kicker={EXAMPLE_PERIOD.label}
        title="Reconciliation"
        description="Source activity is matched to ledger movements on entity, source, asset, direction, and quantity. A match is exact. Anything left on either side is an exception."
      />
      <div className="overflow-x-auto border border-line bg-paper-raised">
        <table className="ledger-table">
          <caption className="sr-only">Example reconciliation for {EXAMPLE_PERIOD.label}</caption>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Source</th>
              <th scope="col">External id</th>
              <th scope="col">Journal</th>
              <th scope="col">Quantity</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((record) => (
              <tr key={record.id}>
                <td className={record.status === "exception" ? "font-medium text-seal" : "text-pine"}>
                  {record.status === "exception" ? "Exception" : "Matched"}
                </td>
                <td>{sourceName(record.sourceId)}</td>
                <td className="num text-left">
                  {record.sourceTransactionId ? externalId.get(record.sourceTransactionId) : "—"}
                </td>
                <td>
                  {record.journalEntryId
                    ? `${exampleBooks.journalEntries.find((entry) => entry.id === record.journalEntryId)?.reference ?? record.journalEntryId}:${record.journalLineNumber}`
                    : "—"}
                </td>
                <td className="num">
                  {record.direction === "out" ? "Out " : "In "}
                  {formatQuantity(record.quantityMinor, record.assetCode)}
                </td>
                <td>{record.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
