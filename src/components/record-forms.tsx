import {
  createEntityAction,
  createFxRateAction,
  importCsvAction,
  postJournalAction,
  postRevaluationAction,
  refreshConnectionAction,
  refreshMarketDataAction,
  reverseJournalAction,
  revokeConnectionAction,
} from "@/app/dashboard/actions";
import type { Books } from "@/data/books";

export function ReadOnlyNote({ demo = false }: { demo?: boolean }) {
  return (
    <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
      {demo
        ? "This demo does not save. Connect a database, then sign in with a password."
        : "This sample is read-only. Connect a database to add companies, wallets, and entries."}
    </p>
  );
}

export function RoleNote({ children }: { children: string }) {
  return <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-soft">{children}</p>;
}

export function EntityForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <form action={createEntityAction} className="mb-10 grid gap-3 panel p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="text-lg font-semibold tracking-tight md:col-span-2">Add a company</h2>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} autoComplete="organization" />
      </label>
      <label className="field">
        <span>Country code</span>
        <input name="jurisdiction" required maxLength={2} placeholder="MY" className="uppercase" />
      </label>
      <label className="field">
        <span>Currency</span>
        <select name="functionalCurrency" defaultValue="MYR">
          <option value="MYR">MYR</option>
          <option value="SGD">SGD</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="field">
        <span>Reporting standard</span>
        <input name="reportingFramework" required defaultValue="IFRS" maxLength={40} />
      </label>
      <label className="field">
        <span>Parent company</span>
        <select name="parentEntityId" defaultValue="">
          <option value="">None — this is the parent</option>
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Add company
        </button>
      </div>
    </form>
  );
}

export function ConnectionControls({
  connectionId,
  csrf,
  revoked,
  next = "/dashboard/settings",
}: {
  connectionId: string;
  csrf: string;
  revoked: boolean;
  next?: string;
}) {
  if (revoked) return <span className="text-sm text-ink-soft">Disconnected</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <form action={refreshConnectionAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="connectionId" value={connectionId} />
        <button type="submit" className="btn-secondary">
          Check
        </button>
      </form>
      <form action={revokeConnectionAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="connectionId" value={connectionId} />
        <button type="submit" className="btn-secondary">
          Disconnect
        </button>
      </form>
    </div>
  );
}

export function RevaluationForm({ entityId, asOf, csrf }: { entityId: string; asOf: string; csrf: string }) {
  return (
    <form action={postRevaluationAction} className="mt-4 flex flex-wrap items-end gap-3 panel p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="asOf" value={asOf} />
      <label className="field">
        <span>Reference</span>
        <input name="reference" required maxLength={40} placeholder="REVAL-2026-06" />
      </label>
      <button type="submit" className="btn">
        Post revaluation entry
      </button>
      <span className="text-sm text-ink-soft">Posts one balanced entry for the net difference. Reverse it if the price was wrong.</span>
    </form>
  );
}

export function MarketDataControls({ csrf, next = "/dashboard/sources" }: { csrf: string; next?: string }) {
  return (
    <form action={refreshMarketDataAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="btn-secondary">
        Refresh prices and rates
      </button>
      <span className="text-sm text-ink-soft">
        Fetches live prices and FX rates, stored with their source and date. Never posts a journal.
      </span>
    </form>
  );
}

export function CsvImportForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <form action={importCsvAction} className="grid gap-3 panel p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="text-lg font-semibold tracking-tight">Import activity</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
        Columns: external_id, occurred_on, asset_code, direction (in or out), quantity, description. Quantity is the
        amount people see, such as 0.1 ETH. This records what moved at that wallet, exchange, or custodian. It does not
        create a journal entry.
      </p>
      <label className="field">
        <span>Held at</span>
        <select name="sourceId" required defaultValue={books.sources[0]?.id}>
          {books.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>CSV file</span>
        <input name="file" type="file" accept=".csv,text/csv" />
      </label>
      <label className="field">
        <span>Or paste CSV</span>
        <textarea name="csv" rows={4} spellCheck={false} className="font-mono text-xs" />
      </label>
      <div>
        <button type="submit" className="btn">
          Import activity
        </button>
      </div>
    </form>
  );
}

export function JournalForm({ books, csrf }: { books: Books; csrf: string }) {
  const accounts = books.accounts;
  return (
    <form action={postJournalAction} className="mb-10 grid gap-3 panel p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="text-lg font-semibold tracking-tight">Post an entry</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
        Debits must equal credits, in the company&apos;s currency. Leave unused lines blank. A token amount needs the
        asset, whether it was received or sent, and where it was held.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="field">
          <span>Company</span>
          <select name="entityId" required defaultValue={books.entities[0]?.id}>
            {books.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reference</span>
          <input name="reference" required maxLength={40} />
        </label>
        <label className="field">
          <span>Date</span>
          <input name="entryDate" type="date" required defaultValue={books.period.end} />
        </label>
        <label className="field md:col-span-2">
          <span>Memo</span>
          <input name="memo" required maxLength={500} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <caption className="sr-only">Journal lines</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Side</th>
              <th scope="col">Amount</th>
              <th scope="col">Asset</th>
              <th scope="col">Quantity</th>
              <th scope="col">Movement</th>
              <th scope="col">Held at</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3].map((index) => (
              <tr key={index}>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_account`}>
                    Line {index + 1} account
                  </label>
                  <select id={`line${index}_account`} name={`line${index}_account`} defaultValue="">
                    <option value="">—</option>
                    {books.entities.map((entity) => (
                      <optgroup key={entity.id} label={entity.name}>
                        {accounts
                          .filter((account) => account.entityId === entity.id)
                          .map((account) => (
                            <option key={account.id} value={account.code}>
                              {account.code} {account.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_side`}>
                    Line {index + 1} side
                  </label>
                  <select id={`line${index}_side`} name={`line${index}_side`} defaultValue="debit">
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_amount`}>
                    Line {index + 1} amount
                  </label>
                  <input id={`line${index}_amount`} name={`line${index}_amount`} inputMode="decimal" className="w-28" />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_asset`}>
                    Line {index + 1} asset
                  </label>
                  <select id={`line${index}_asset`} name={`line${index}_asset`} defaultValue="">
                    <option value="">—</option>
                    {books.assets.map((asset) => (
                      <option key={asset.id} value={asset.code}>
                        {asset.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_quantity`}>
                    Line {index + 1} quantity
                  </label>
                  <input id={`line${index}_quantity`} name={`line${index}_quantity`} inputMode="decimal" className="w-24" />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_direction`}>
                    Line {index + 1} movement
                  </label>
                  <select id={`line${index}_direction`} name={`line${index}_direction`} defaultValue="">
                    <option value="">—</option>
                    <option value="in">Received</option>
                    <option value="out">Sent</option>
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_source`}>
                    Line {index + 1} held at
                  </label>
                  <select id={`line${index}_source`} name={`line${index}_source`} defaultValue="">
                    <option value="">—</option>
                    {books.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button type="submit" className="btn">
          Post entry
        </button>
      </div>
    </form>
  );
}

export function ReverseJournalForm({
  csrf,
  entry,
}: {
  csrf: string;
  entry: { id: string; reference: string; entryDate: string };
}) {
  return (
    <form action={reverseJournalAction} className="grid gap-3 border-t border-line px-4 py-3 md:grid-cols-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="entryId" value={entry.id} />
      <label className="field">
        <span>Correction reference</span>
        <input name="reference" required defaultValue={`${entry.reference}-R`} maxLength={40} />
      </label>
      <label className="field">
        <span>Correction date</span>
        <input name="entryDate" type="date" required defaultValue={entry.entryDate} />
      </label>
      <label className="field md:col-span-3">
        <span>Memo</span>
        <input name="memo" required maxLength={500} defaultValue={`Correct ${entry.reference}.`} />
      </label>
      <div className="md:col-span-3">
        <button type="submit" className="btn-secondary">
          Post correction
        </button>
      </div>
    </form>
  );
}

export function FxRateForm({ csrf, defaultDate }: { csrf: string; defaultDate: string }) {
  return (
    <form action={createFxRateAction} className="mt-4 grid gap-3 panel p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <h3 className="text-lg font-semibold tracking-tight md:col-span-2">Add a rate</h3>
      <p className="text-sm text-ink-soft md:col-span-2">
        Save one direction. The other direction is calculated from it, so the two cannot disagree.
      </p>
      <label className="field">
        <span>Base</span>
        <input name="baseCurrency" required maxLength={3} defaultValue="MYR" className="uppercase" />
      </label>
      <label className="field">
        <span>Quote</span>
        <input name="quoteCurrency" required maxLength={3} defaultValue="SGD" className="uppercase" />
      </label>
      <label className="field">
        <span>Rate (quote per 1 base)</span>
        <input name="rate" required inputMode="decimal" placeholder="0.3000" />
      </label>
      <label className="field">
        <span>As of</span>
        <input name="asOf" type="date" required defaultValue={defaultDate} />
      </label>
      <label className="field md:col-span-2">
        <span>Note</span>
        <input name="note" required maxLength={300} />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Save rate
        </button>
      </div>
    </form>
  );
}
