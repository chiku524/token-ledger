"use client";

import { useState } from "react";
import { TableCard } from "@/components/app/table-card";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reopenConnectionTourAction } from "@/app/dashboard/tour-actions";
import { cn } from "@/lib/utils";

/** Ordered to match getting-started: connect → Check → balances → next. */
export const GUIDE_SECTIONS = [
  { id: "connect", label: "Connect", title: "Three ways in" },
  { id: "check", label: "Check", title: "From add to disconnect" },
  { id: "balances", label: "Balances", title: "Where balances sit" },
  { id: "next", label: "Next", title: "Who does what" },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

const MODES = [
  {
    title: "Watch-only wallet",
    why: "Public chain data — no key to seal.",
    where: "Connection steps or Settings → add a wallet.",
    stores: "A public address and the network",
    reads: "Balances and transfers from a chain reader",
    secret: "No key. Chain data is public.",
  },
  {
    title: "Exchange, read-only",
    why: "Pull balances and activity from an exchange account without trading rights.",
    where: "Connection steps or Settings. Coinbase accepts an API key, or OAuth when that is configured.",
    stores: "The account id, and a sealed read-only API key when one is needed",
    reads: "Balances, trades, deposits, and withdrawals",
    secret: "A read-only API key and secret may be entered. Trading and withdrawal stay off.",
  },
  {
    title: "Custodian, read-only",
    why: "Institutional vaults need a viewer credential, not a signing key.",
    where: "Connection steps or Settings → custodian.",
    stores: "The vault id, a network when the vault has one, and a sealed viewer credential",
    reads: "Vault balances and movements",
    secret: "A read-only viewer credential may be entered. It cannot sign or move funds.",
  },
];

const LIFE = [
  {
    title: "Add",
    detail:
      "Signup can connect a wallet, an exchange, a custodian, or all of them. Later, an owner or admin adds another from Settings or the connection steps. The connection starts as Waiting until someone Checks it.",
  },
  {
    title: "Check",
    detail:
      "Settings → Check asks that venue’s reader for balances and movements. Connecting alone does not pull coins — after Coinbase (or any venue) saves, you still need Check before Holdings fills.",
  },
  {
    title: "Observe",
    detail:
      "A successful check stores quantities and new movements without posting a journal. Those rows appear on Holdings under Observed balances, with accounts listed further down the same page.",
  },
  {
    title: "Disconnect",
    detail:
      "Stops future reads. Past observations, accounts, and anything already journaled stay. Re-add the venue if you need reads again.",
  },
];

function Pitfalls({ items }: { items: string[] }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Common pitfalls</p>
      <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectSection() {
  return (
    <section aria-labelledby="modes-heading">
      <h2 id="modes-heading" className="text-lg font-semibold tracking-tight">
        Three ways in
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why:</span> a connection is read-only consent for one company —
        Token Ledger can see balances and movements, not withdraw, trade, or sign.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">What:</span> pick a wallet, exchange, or custodian. A wallet can be
        verified (connect and sign a one-time message) or watched (paste the address). Verified means the sign-in
        controlled the address. Watched means the address was typed — right for an auditor or a cold wallet.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Where:</span> use{" "}
        <a href="/dashboard/setup" className="underline">
          connection steps
        </a>{" "}
        the first time, or{" "}
        <a href="/dashboard/settings#connections" className="underline">
          Settings → Connections
        </a>{" "}
        later.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {MODES.map((mode) => (
          <li key={mode.title} className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium">{mode.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{mode.why}</p>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Where</dt>
                <dd className="mt-1">{mode.where}</dd>
              </div>
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
      <Pitfalls
        items={[
          "Saving Coinbase (API key or OAuth) only creates the connection — it does not import balances yet.",
          "Use a read-only key. Trading or withdrawal scopes are not needed and should stay off.",
          "A connection without a company cannot be added; create the company first if Settings blocks you.",
        ]}
      />
    </section>
  );
}

function CheckSection() {
  return (
    <section aria-labelledby="life-heading">
      <h2 id="life-heading" className="text-lg font-semibold tracking-tight">
        From add to disconnect
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why:</span> Check is the sync step. Until it succeeds, Holdings
        stays empty even if the venue connected cleanly.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">What:</span> Settings runs the venue’s reader, updates status, and
        stores observations. Operations shows the same health if you prefer a sync-focused view.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Where:</span>{" "}
        <a href="/dashboard/settings#connections" className="underline">
          Settings → Connections
        </a>{" "}
        → Check on the row. Status and last-checked time tell you whether the read worked.
      </p>
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
              <TableHead scope="col">What to do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Waiting</TableCell>
              <TableCell>Added, and not successfully checked yet. A failed first check stays here.</TableCell>
              <TableCell>Press Check. If it fails, read the error on the row and fix the credential or venue access.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Up to date</TableCell>
              <TableCell>The last check returned balances and movements.</TableCell>
              <TableCell>Open Holdings → Observed balances for the coins that were read.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Needs attention</TableCell>
              <TableCell>A check failed after an earlier success.</TableCell>
              <TableCell>Check again. Past observations remain until a later check replaces them.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Disconnected</TableCell>
              <TableCell>An admin stopped future reads. History remains.</TableCell>
              <TableCell>Re-connect if you need new reads; history is not deleted by disconnect.</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableCard>
      <Pitfalls
        items={[
          "Connected Coinbase but see no coins? You likely still need Check — then open Holdings.",
          "Check never posts a journal entry. Empty books after a good Check is expected until someone imports or matches.",
          "If status stays Waiting with an error, the reader did not succeed — fix that before looking for balances.",
        ]}
      />
    </section>
  );
}

function BalancesSection() {
  return (
    <section aria-labelledby="shape-heading">
      <h2 id="shape-heading" className="text-lg font-semibold tracking-tight">
        Where balances sit
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why:</span> observations are source facts from the venue. They stay
        beside the journal so you can see what the exchange reported before anything is booked.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">What:</span> after Check, Holdings lists Observed balances (quantity
        and as-of time), optional market value from saved prices, booked value from the journal, and Accounts under each
        connection.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Where:</span>{" "}
        <a href="/dashboard/sources#observed-balances" className="underline">
          Holdings → Observed balances
        </a>
        . Scroll further for Accounts. Market value is a price overlay — it never posts to the journal.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="grid gap-2" aria-label="From the company down to an observation">
          {[
            ["Company", "The legal entity that holds the asset."],
            ["Connection", "Read-only grant. Scopes are balances and movements."],
            ["Account", "One address, exchange account, or vault under that connection."],
            ["Observation", "A balance at a moment, plus movements since the last cursor. Listed on Holdings."],
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
              <span className="mt-1 block text-muted-foreground">
                What the venue reported on Holdings. Can include activity that has no journal entry yet.
              </span>
            </li>
            <li>
              <span className="font-medium">Movement</span>
              <span className="mt-1 block text-muted-foreground">
                A deposit, withdrawal, trade, or transfer stored as a source fact for later matching.
              </span>
            </li>
            <li>
              <span className="font-medium">Journal</span>
              <span className="mt-1 block text-muted-foreground">What an accountant posted. A check never posts one.</span>
            </li>
            <li>
              <span className="font-medium">Matching</span>
              <span className="mt-1 block text-muted-foreground">
                Compares movements with journal lines and keeps exceptions visible.
              </span>
            </li>
          </ul>
        </div>
      </div>
      <Pitfalls
        items={[
          "Looking for coins under Settings or Overview? They show on Holdings after a successful Check.",
          "Observed balances empty but status Up to date usually means the venue reported no holdings — not a missing page.",
          "Booked value and Reports stay empty until activity is journaled; that is separate from Check.",
        ]}
      />
    </section>
  );
}

function NextSection({ csrf, canRestartTour }: { csrf: string; canRestartTour: boolean }) {
  return (
    <section aria-labelledby="roles-heading">
      <h2 id="roles-heading" className="text-lg font-semibold tracking-tight">
        Who does what
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why:</span> once observations exist, the books catch up through
        import, journal posts, and Matching — not through another Check.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">What:</span> owners and admins manage connections. Accountants import
        CSV activity and post the journal. Matching compares source movements with journal lines. Approvers handle
        prepared entries when your workflow uses approval.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Where next:</span>{" "}
        <a href="/dashboard/reconciliation" className="underline">
          Matching
        </a>{" "}
        for exceptions,{" "}
        <a href="/dashboard/ledger" className="underline">
          Journal
        </a>{" "}
        for posted entries, Holdings for CSV import when a source has no live reader.
      </p>
      <TableCard>
        <Table>
          <caption className="sr-only">Roles for connections</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col">Connections</TableHead>
              <TableHead scope="col">Books</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Owner and admin</TableCell>
              <TableCell>
                Add a connection from Settings, check it, and disconnect it. Signup asks once. A new owner or admin also
                gets the getting started guide once.
              </TableCell>
              <TableCell>Full access, including users (owners manage other owners).</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Accountant</TableCell>
              <TableCell>Cannot add or check a connection.</TableCell>
              <TableCell>Import CSV activity, post and reverse journal lines, run Matching.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Approver</TableCell>
              <TableCell>Read-only on connections.</TableCell>
              <TableCell>Approve prepared journal drafts; cannot post directly.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Viewer</TableCell>
              <TableCell>Read the guide, observations, and connection status.</TableCell>
              <TableCell>Read reports and history; no writes.</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableCard>
      <Pitfalls
        items={[
          "Do not expect Check to fill the journal — use import or Matching when you are ready to book.",
          "If the short coach is gone, restart it below (owners and admins). It does not replace this Guide.",
        ]}
      />
      {canRestartTour ? (
        <form action={reopenConnectionTourAction} className="mt-4">
          <input type="hidden" name="csrf" value={csrf} />
          <SubmitButton>Take the getting started guide</SubmitButton>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          A new owner or admin is offered a short getting started guide the first time they sign in — connect, Check,
          then find balances on Holdings.
        </p>
      )}
    </section>
  );
}

export function ConnectionGuide({
  csrf,
  canRestartTour,
  initialSection = "connect",
}: {
  csrf: string;
  canRestartTour: boolean;
  /** Defaults to Connect — first step in the onboarding sequence. */
  initialSection?: GuideSectionId;
}) {
  const [selected, setSelected] = useState<GuideSectionId>(initialSection);

  return (
    <div className="grid max-w-5xl gap-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <nav aria-label="Guide sections" className="md:sticky md:top-6 md:self-start">
        <p className="eyebrow">On this page</p>
        <ol className="mt-3 grid gap-1">
          {GUIDE_SECTIONS.map((section, index) => {
            const active = section.id === selected;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(section.id)}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-brand",
                  )}
                >
                  <span className={cn("text-xs tracking-[0.12em] uppercase", active ? "opacity-80" : "text-muted-foreground")}>
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{section.label}</span>
                    <span className={cn("mt-0.5 block text-xs", active ? "opacity-80" : "text-muted-foreground")}>
                      {section.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div>
        {selected === "connect" ? <ConnectSection /> : null}
        {selected === "check" ? <CheckSection /> : null}
        {selected === "balances" ? <BalancesSection /> : null}
        {selected === "next" ? <NextSection csrf={csrf} canRestartTour={canRestartTour} /> : null}
      </div>
    </div>
  );
}
