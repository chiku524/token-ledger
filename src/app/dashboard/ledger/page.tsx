import { PageHeader } from "@/components/page-header";
import { exampleJournalEntries } from "@/data/example-books";
import { accountLabel, entityName, formatMoney, formatQuantity, sourceName } from "@/data/present";

export const metadata = { title: "Ledger" };

export default function LedgerPage() {
  const entries = [...exampleJournalEntries].sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.reference.localeCompare(b.reference));

  return (
    <>
      <PageHeader
        kicker="Journal"
        title="Double-entry ledger"
        description="Every entry was posted by the ledger module, which rejects the entry unless debits equal credits in one functional currency. Token quantities sit on the line as subledger detail."
      />
      <div className="space-y-6">
        {entries.map((entry) => (
          <article key={entry.id} className="border border-line bg-paper-raised">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-medium">
                  {entry.reference}
                  <span className="ml-3 font-normal text-ink-soft">{entry.entryDate}</span>
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{entityName(entry.entityId)} · {entry.memo}</p>
              </div>
              <p className="text-sm text-pine">Balanced {formatMoney(entry.debitMinor, entry.currency)}</p>
            </header>
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <caption className="sr-only">{entry.reference} lines</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Account</th>
                    <th scope="col">Quantity</th>
                    <th scope="col" className="num">Debit</th>
                    <th scope="col" className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.lineNumber}>
                      <td className="num text-left">{line.lineNumber}</td>
                      <td>
                        {accountLabel(entry.entityId, line.accountCode)}
                        {line.sourceId ? <span className="mt-1 block text-xs text-ink-soft">{sourceName(line.sourceId)}</span> : null}
                      </td>
                      <td>
                        {line.quantityMinor !== undefined && line.assetCode
                          ? `${line.quantityDirection === "out" ? "Out " : "In "}${formatQuantity(line.quantityMinor, line.assetCode)}`
                          : "—"}
                      </td>
                      <td className="num">{line.side === "debit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                      <td className="num">{line.side === "credit" ? formatMoney(line.amountMinor, line.currency) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
