import { createEntityAction, createSourceAction, importCsvAction, postJournalAction } from "@/app/dashboard/actions";
import type { Books } from "@/data/books";

export function ReadOnlyNote() {
  return (
    <p className="mb-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
      This example is read-only. Connect a database to add companies, wallets, and entries.
    </p>
  );
}

export function EntityForm({ books }: { books: Books }) {
  return (
    <form action={createEntityAction} className="mb-10 grid gap-3 border border-line bg-paper-raised p-4 md:grid-cols-2">
      <h2 className="font-serif text-2xl md:col-span-2">Add a company</h2>
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
      <label className="field">
        <span>Your name</span>
        <input name="recordedBy" required maxLength={80} autoComplete="name" />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Add company
        </button>
      </div>
    </form>
  );
}

export function SourceForm({ books }: { books: Books }) {
  return (
    <form action={createSourceAction} className="grid gap-3 border border-line bg-paper-raised p-4 md:grid-cols-2">
      <h2 className="font-serif text-2xl md:col-span-2">Add a wallet, exchange, or custodian</h2>
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
        <span>Type</span>
        <select name="kind" defaultValue="wallet">
          <option value="wallet">Wallet</option>
          <option value="exchange">Exchange</option>
          <option value="custodian">Custodian</option>
        </select>
      </label>
      <label className="field">
        <span>Wallet type</span>
        <select name="role" defaultValue="hot">
          <option value="">Not a wallet</option>
          <option value="hot">Hot wallet</option>
          <option value="cold">Cold wallet</option>
          <option value="staking">Staking</option>
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} />
      </label>
      <label className="field">
        <span>Network</span>
        <input name="chain" maxLength={40} />
      </label>
      <label className="field">
        <span>Address or account ID</span>
        <input name="identifier" required maxLength={200} className="font-mono text-sm" />
      </label>
      <label className="field md:col-span-2">
        <span>Your name</span>
        <input name="recordedBy" required maxLength={80} autoComplete="name" />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Add place
        </button>
      </div>
    </form>
  );
}

export function CsvImportForm({ books }: { books: Books }) {
  return (
    <form action={importCsvAction} className="grid gap-3 border border-line bg-paper-raised p-4">
      <h2 className="font-serif text-2xl">Import activity</h2>
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
      <label className="field">
        <span>Your name</span>
        <input name="recordedBy" required maxLength={80} autoComplete="name" />
      </label>
      <div>
        <button type="submit" className="btn">
          Import activity
        </button>
      </div>
    </form>
  );
}

export function JournalForm({ books }: { books: Books }) {
  const accounts = books.accounts;
  return (
    <form action={postJournalAction} className="mb-10 grid gap-3 border border-line bg-paper-raised p-4">
      <h2 className="font-serif text-2xl">Post an entry</h2>
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
        <label className="field">
          <span>Your name</span>
          <input name="postedBy" required maxLength={80} autoComplete="name" />
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
