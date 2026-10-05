import { TableCard } from "@/components/app/table-card";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    stores: "The account id, and a sealed read-only API key when one is needed",
    reads: "Balances, trades, deposits, and withdrawals",
    secret: "A read-only API key and secret may be entered. Trading and withdrawal stay off.",
  },
  {
    title: "Custodian, read-only",
    stores: "The vault id, a network when the vault has one, and a sealed viewer credential",
    reads: "Vault balances and movements",
    secret: "A read-only viewer credential may be entered. It cannot sign or move funds.",
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
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
              <li key={title} className="rounded-xl border border-border bg-card px-4 py-3" style={{ marginLeft: `${index * 0.75}rem` }}>
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{index + 1}</p>
                <p className="mt-1 font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Beside the read, not inside it</p>
            <ul className="mt-3 grid gap-3 text-sm">
              <li>
                <span className="font-medium">Observed balance</span>
                <span className="mt-1 block text-muted-foreground">What the venue reported. This can include activity that has no journal entry yet.</span>
              </li>
              <li>
                <span className="font-medium">Movement</span>
                <span className="mt-1 block text-muted-foreground">A deposit, withdrawal, trade, or transfer, stored as a source fact.</span>
              </li>
              <li>
                <span className="font-medium">Journal</span>
                <span className="mt-1 block text-muted-foreground">What an accountant posted. A check never posts one.</span>
              </li>
              <li>
                <span className="font-medium">Matching</span>
                <span className="mt-1 block text-muted-foreground">Compares movements with journal lines and keeps the exceptions visible.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="modes-heading">
        <h2 id="modes-heading" className="text-lg font-semibold tracking-tight">
          Three ways in
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A wallet can be verified, by connecting it and signing a one-time message, or watched, by pasting the address.
          Both stay read-only. Verified means the sign-in controlled the address. Watched means the address was typed,
          which is the right path for an auditor or a cold wallet.
        </p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {MODES.map((mode) => (
            <li key={mode.title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-medium">{mode.title}</h3>
              <dl className="mt-3 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Stored</dt>
                  <dd className="mt-1">{mode.stores}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Read</dt>
                  <dd className="mt-1">{mode.reads}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Secret</dt>
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
            <li key={step.title} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs tracking-[0.14em] text-success uppercase">{index + 1}</p>
              <h3 className="mt-2 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
        <TableCard>
          <Table>
            <caption className="sr-only">What each status means</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Waiting</TableCell>
                <TableCell>Added, and not successfully checked yet. A failed first check stays here.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Up to date</TableCell>
                <TableCell>The last check returned balances and movements.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Needs attention</TableCell>
                <TableCell>A check failed after an earlier success.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Disconnected</TableCell>
                <TableCell>An admin stopped future reads. History remains.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="text-lg font-semibold tracking-tight">
          Who does what
        </h2>
        <TableCard>
          <Table>
            <caption className="sr-only">Roles for connections</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Role</TableHead>
                <TableHead scope="col">Connections</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Owner and admin</TableCell>
                <TableCell>Add a connection from Settings, check it, and disconnect it. Signup asks for this once. A new owner or admin is also shown the getting started guide once.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Accountant</TableCell>
                <TableCell>Import a CSV of activity and post the journal. Cannot add a connection.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Viewer</TableCell>
                <TableCell>Read the guide, the observations, and the books.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableCard>
        {canRestartTour ? (
          <form action={reopenConnectionTourAction} className="mt-4">
            <input type="hidden" name="csrf" value={csrf} />
            <SubmitButton>
              Take the getting started guide
            </SubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            A new owner or admin is offered a short getting started guide the first time they sign in — connect, Check, then find balances on Holdings.
          </p>
        )}
      </section>
    </div>
  );
}
