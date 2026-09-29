import { createEntityAction, createFxRateAction, createSourceAction, importCsvAction, postJournalAction, reverseJournalAction } from "@/app/dashboard/actions";
import type { Books } from "@/data/books";

export function ReadOnlyNote({ demo = false }: { demo?: boolean }) {
  return (
    <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
      {demo
        ? "Demo preview does not save. Set DATABASE_URL, run the migration and seed, then sign in with a password to record books."
        : "These example books are read-only until Postgres is configured. Set DATABASE_URL, run pnpm db:migrate and pnpm db:seed, then sign in."}
    </p>
  );
}

export function RoleNote({ children }: { children: string }) {
  return <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-soft">{children}</p>;
}

export function EntityForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <form action={createEntityAction} className="mb-10 grid gap-3 border border-line bg-paper-raised p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="font-serif text-2xl md:col-span-2">Add an entity</h2>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} autoComplete="organization" />
      </label>
      <label className="field">
        <span>Jurisdiction</span>
        <input name="jurisdiction" required maxLength={2} placeholder="MY" className="uppercase" />
      </label>
      <label className="field">
        <span>Functional currency</span>
        <select name="functionalCurrency" defaultValue="MYR">
          <option value="MYR">MYR</option>
          <option value="SGD">SGD</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="field">
        <span>Reporting framework</span>
        <input name="reportingFramework" required defaultValue="IFRS" maxLength={40} />
      </label>
      <label className="field">
        <span>Parent</span>
        <select name="parentEntityId" defaultValue="">
          <option value="">None — this is a parent</option>
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Record entity
        </button>
      </div>
    </form>
  );
}

export function SourceForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <form action={createSourceAction} className="grid gap-3 border border-line bg-paper-raised p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="font-serif text-2xl md:col-span-2">Add a source</h2>
      <label className="field">
        <span>Entity</span>
        <select name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Kind</span>
        <select name="kind" defaultValue="wallet">
          <option value="wallet">Wallet</option>
          <option value="exchange">Exchange</option>
          <option value="custodian">Custodian</option>
        </select>
      </label>
      <label className="field">
        <span>Wallet role</span>
        <select name="role" defaultValue="hot">
          <option value="">None</option>
          <option value="hot">Hot</option>
          <option value="cold">Cold</option>
          <option value="staking">Staking</option>
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} />
      </label>
      <label className="field">
        <span>Chain</span>
        <input name="chain" maxLength={40} />
      </label>
      <label className="field">
        <span>Identifier</span>
        <input name="identifier" required maxLength={200} className="font-mono text-sm" />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Record source
        </button>
      </div>
    </form>
  );
}

export function CsvImportForm({ books, csrf }: { books: Books; csrf: string }) {
  return (
    <form action={importCsvAction} className="grid gap-3 border border-line bg-paper-raised p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="font-serif text-2xl">Import source transactions</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
        CSV columns: external_id, occurred_on, asset_code, direction, quantity, description. Quantity is in major units.
        This records source facts for reconciliation. It does not post a journal.
      </p>
      <label className="field">
        <span>Source</span>
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
          Import CSV
        </button>
      </div>
    </form>
  );
}

export function JournalForm({ books, csrf }: { books: Books; csrf: string }) {
  const accounts = books.accounts;
  return (
    <form action={postJournalAction} className="mb-10 grid gap-3 border border-line bg-paper-raised p-4">
      <input type="hidden" name="csrf" value={csrf} />
      <h2 className="font-serif text-2xl">Post a journal</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
        Debits must equal credits. The currency is the entity&apos;s functional currency. Leave unused lines blank.
        A quantity needs an asset, a direction, and a source on that same line.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="field">
          <span>Entity</span>
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
              <th scope="col">Direction</th>
              <th scope="col">Source</th>
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
                    Line {index + 1} direction
                  </label>
                  <select id={`line${index}_direction`} name={`line${index}_direction`} defaultValue="">
                    <option value="">—</option>
                    <option value="in">In</option>
                    <option value="out">Out</option>
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`line${index}_source`}>
                    Line {index + 1} source
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
          Post journal
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
        <span>Reversal reference</span>
        <input name="reference" required defaultValue={`${entry.reference}-R`} maxLength={40} />
      </label>
      <label className="field">
        <span>Reversal date</span>
        <input name="entryDate" type="date" required defaultValue={entry.entryDate} />
      </label>
      <label className="field md:col-span-3">
        <span>Memo</span>
        <input name="memo" required maxLength={500} defaultValue={`Reverse ${entry.reference}.`} />
      </label>
      <div className="md:col-span-3">
        <button type="submit" className="btn-secondary">
          Post reversal
        </button>
      </div>
    </form>
  );
}

export function FxRateForm({ csrf, defaultDate }: { csrf: string; defaultDate: string }) {
  return (
    <form action={createFxRateAction} className="mt-4 grid gap-3 border border-line bg-paper-raised p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <h3 className="font-serif text-2xl md:col-span-2">Add a rate</h3>
      <p className="text-sm text-ink-soft md:col-span-2">
        Store one direction. The other direction is the exact inverse, so a pair cannot disagree with itself.
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
          Record rate
        </button>
      </div>
    </form>
  );
}
