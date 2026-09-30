import { reopenConnectionTourAction } from "@/app/dashboard/tour-actions";

const MODES = [
  {
    title: "Watch-only wallet",
    stores: "A public address and the network",
    reads: "Balances and transfers from a chain reader",
    secret: "No key. Chain data is public.",
  },
  {
    title: "Exchange, read-only",
    stores: "The account id",
    reads: "Balances, trades, deposits, and withdrawals",
    secret: "An API key is not collected. A live reader must be a read-only grant.",
  },
  {
    title: "Custodian, read-only",
    stores: "The vault id, and a network when the vault has one",
    reads: "Vault balances and movements",
    secret: "A viewer credential is not collected yet.",
  },
];

const LIFE = [
  { title: "Add", detail: "Signup can connect a wallet, an exchange, a custodian, or all of them. Later, an owner or admin adds another from Settings. The connection starts as Waiting." },
  { title: "Check", detail: "The reader for that venue is asked for balances and movements. A stub reader sends nothing." },
  { title: "Observe", detail: "A successful check stores a balance at that time, and new movements, without posting a journal." },
  { title: "Disconnect", detail: "Future reads stop. The accounts, observations, and journal stay." },
];

export function ConnectionGuide({ csrf, canRestartTour }: { csrf: string; canRestartTour: boolean }) {
  return (
    <div className="grid max-w-5xl gap-12">
      <section aria-labelledby="shape-heading">
        <h2 id="shape-heading" className="text-lg font-semibold tracking-tight">
          Where a connection sits
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The connection is consent for a company. Accounts hang off it. What was read stays separate from what was posted.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ol className="grid gap-2" aria-label="From the company down to an observation">
            {[
              ["Company", "The legal entity that holds the asset."],
              ["Connection", "Read-only. Scopes are balances and movements."],
              ["Account", "One address, exchange account, or vault."],
              ["Observation", "A balance at a moment, plus the movements since the last cursor."],
            ].map(([title, detail], index) => (
              <li key={title} className="panel px-4 py-3" style={{ marginLeft: `${index * 0.75}rem` }}>
                <p className="text-xs tracking-[0.14em] text-ink-soft uppercase">{index + 1}</p>
                <p className="mt-1 font-medium">{title}</p>
                <p className="mt-1 text-sm text-ink-soft">{detail}</p>
              </li>
            ))}
          </ol>
          <div className="panel p-4">
            <p className="text-xs tracking-[0.14em] text-ink-soft uppercase">Beside the read, not inside it</p>
            <ul className="mt-3 grid gap-3 text-sm">
              <li>
                <span className="font-medium">Observed balance</span>
                <span className="mt-1 block text-ink-soft">What the venue reported. This can include activity that has no journal entry yet.</span>
              </li>
              <li>
                <span className="font-medium">Movement</span>
                <span className="mt-1 block text-ink-soft">A deposit, withdrawal, trade, or transfer, stored as a source fact.</span>
              </li>
              <li>
                <span className="font-medium">Journal</span>
                <span className="mt-1 block text-ink-soft">What an accountant posted. A check never posts one.</span>
              </li>
              <li>
                <span className="font-medium">Matching</span>
                <span className="mt-1 block text-ink-soft">Compares movements with journal lines and keeps the exceptions visible.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="modes-heading">
        <h2 id="modes-heading" className="text-lg font-semibold tracking-tight">
          Three ways in
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {MODES.map((mode) => (
            <li key={mode.title} className="panel p-4">
              <h3 className="font-medium">{mode.title}</h3>
              <dl className="mt-3 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-[0.12em] text-ink-soft uppercase">Stored</dt>
                  <dd className="mt-1">{mode.stores}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.12em] text-ink-soft uppercase">Read</dt>
                  <dd className="mt-1">{mode.reads}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.12em] text-ink-soft uppercase">Secret</dt>
                  <dd className="mt-1">{mode.secret}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="life-heading">
        <h2 id="life-heading" className="text-lg font-semibold tracking-tight">
          From add to disconnect
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-4" aria-label="Connection lifecycle">
          {LIFE.map((step, index) => (
            <li key={step.title} className="panel p-4">
              <p className="text-xs tracking-[0.14em] text-pine uppercase">{index + 1}</p>
              <h3 className="mt-2 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.detail}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">What each status means</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Waiting</td>
                <td>Added, and not successfully checked yet. A failed first check stays here.</td>
              </tr>
              <tr>
                <td>Up to date</td>
                <td>The last check returned balances and movements.</td>
              </tr>
              <tr>
                <td>Needs attention</td>
                <td>A check failed after an earlier success.</td>
              </tr>
              <tr>
                <td>Disconnected</td>
                <td>An admin stopped future reads. History remains.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="text-lg font-semibold tracking-tight">
          Who does what
        </h2>
        <div className="mt-4 overflow-x-auto panel">
          <table className="ledger-table">
            <caption className="sr-only">Roles for connections</caption>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Connections</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Owner and admin</td>
                <td>Add a connection from Settings, check it, and disconnect it. Signup asks for this once. A new admin is also shown the tour once.</td>
              </tr>
              <tr>
                <td>Accountant</td>
                <td>Import a CSV of activity and post the journal. Cannot add a connection.</td>
              </tr>
              <tr>
                <td>Viewer</td>
                <td>Read the guide, the observations, and the books.</td>
              </tr>
            </tbody>
          </table>
        </div>
        {canRestartTour ? (
          <form action={reopenConnectionTourAction} className="mt-4">
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="btn">
              Take the tour
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">A new admin is offered the tour the first time they sign in.</p>
        )}
      </section>
    </div>
  );
}
