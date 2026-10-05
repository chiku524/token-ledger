"use client";

import { useId, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookText,
  Building2,
  Eye,
  GitCompareArrows,
  Landmark,
  Link2,
  RefreshCw,
  Shield,
  Unplug,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { m } from "motion/react";
import { TableCard } from "@/components/app/table-card";
import { Presence } from "@/components/motion/presence";
import { SubmitButton } from "@/components/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reopenConnectionTourAction } from "@/app/dashboard/tour-actions";
import { cn } from "@/lib/utils";

/** Ordered to match getting-started: connect → Check → balances → next. */
export const GUIDE_SECTIONS = [
  { id: "connect", label: "Connect", title: "Three ways in", icon: Link2 },
  { id: "check", label: "Check", title: "From add to disconnect", icon: RefreshCw },
  { id: "balances", label: "Balances", title: "Where balances sit", icon: Wallet },
  { id: "next", label: "Next", title: "Who does what", icon: GitCompareArrows },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

const MODES: {
  title: string;
  why: string;
  where: string;
  stores: string;
  reads: string;
  secret: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Watch-only wallet",
    why: "Public chain data — no key to seal.",
    where: "Connection steps or Settings → add a wallet.",
    stores: "A public address and the network",
    reads: "Balances and transfers from a chain reader",
    secret: "No key. Chain data is public.",
    icon: Wallet,
  },
  {
    title: "Exchange, read-only",
    why: "Pull balances and activity from an exchange account without trading rights.",
    where: "Connection steps or Settings. Coinbase accepts an API key, or OAuth when that is configured.",
    stores: "The account id, and a sealed read-only API key when one is needed",
    reads: "Balances, trades, deposits, and withdrawals",
    secret: "A read-only API key and secret may be entered. Trading and withdrawal stay off.",
    icon: Building2,
  },
  {
    title: "Custodian, read-only",
    why: "Institutional vaults need a viewer credential, not a signing key.",
    where: "Connection steps or Settings → custodian.",
    stores: "The vault id, a network when the vault has one, and a sealed viewer credential",
    reads: "Vault balances and movements",
    secret: "A read-only viewer credential may be entered. It cannot sign or move funds.",
    icon: Landmark,
  },
];

const LIFE: { title: string; detail: string; icon: LucideIcon }[] = [
  {
    title: "Add",
    detail:
      "Signup can connect a wallet, an exchange, a custodian, or all of them. Later, an owner or admin adds another from Settings or the connection steps. The connection starts as Waiting until someone Checks it.",
    icon: Link2,
  },
  {
    title: "Check",
    detail:
      "Settings → Check asks that venue’s reader for balances and movements. Connecting alone does not pull coins — after Coinbase (or any venue) saves, you still need Check before Holdings fills.",
    icon: RefreshCw,
  },
  {
    title: "Observe",
    detail:
      "A successful check stores quantities and new movements without posting a journal. Those rows appear on Holdings under Observed balances, with accounts listed further down the same page.",
    icon: Eye,
  },
  {
    title: "Disconnect",
    detail:
      "Stops future reads. Past observations, accounts, and anything already journaled stay. Re-add the venue if you need reads again.",
    icon: Unplug,
  },
];

const HIERARCHY: { title: string; detail: string; icon: LucideIcon }[] = [
  { title: "Company", detail: "The legal entity that holds the asset.", icon: Building2 },
  { title: "Connection", detail: "Read-only grant. Scopes are balances and movements.", icon: Link2 },
  { title: "Account", detail: "One address, exchange account, or vault under that connection.", icon: Wallet },
  { title: "Observation", detail: "A balance at a moment, plus movements since the last cursor. Listed on Holdings.", icon: Eye },
];

function IconTile({ icon: Icon, accent = false }: { icon: LucideIcon; accent?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border",
        accent ? "border-primary/30 bg-primary/15 text-foreground" : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" strokeWidth={1.7} aria-hidden />
    </span>
  );
}

/** Horizontal step diagram — staggers in when the section mounts. */
function FlowDiagram({
  steps,
  label,
}: {
  steps: { icon: LucideIcon; label: string; accent?: boolean }[];
  label: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card px-4 py-4">
      <ol className="stagger flex min-w-min items-center gap-2" aria-label={label}>
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
              <IconTile icon={step.icon} accent={step.accent} />
              <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
            </div>
            {index < steps.length - 1 ? (
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Pitfalls({ items }: { items: string[] }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">
        <AlertTriangle className="size-3.5" aria-hidden />
        Common pitfalls
      </p>
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
      <div className="flex items-start gap-3">
        <IconTile icon={Link2} accent />
        <div>
          <h2 id="modes-heading" className="text-lg font-semibold tracking-tight">
            Three ways in
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> a connection is read-only consent for one company —
            Token Ledger can see balances and movements, not withdraw, trade, or sign.
          </p>
        </div>
      </div>
      <FlowDiagram
        label="How a venue becomes a connection"
        steps={[
          { icon: Wallet, label: "Wallet" },
          { icon: Building2, label: "Exchange" },
          { icon: Landmark, label: "Custodian" },
          { icon: Shield, label: "Read-only grant", accent: true },
        ]}
      />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
      <ul className="stagger mt-4 grid gap-3 md:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <li key={mode.title} className="h-full rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                <IconTile icon={Icon} />
                <h3 className="font-medium">{mode.title}</h3>
              </div>
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
          );
        })}
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
      <div className="flex items-start gap-3">
        <IconTile icon={RefreshCw} accent />
        <div>
          <h2 id="life-heading" className="text-lg font-semibold tracking-tight">
            From add to disconnect
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> Check is the sync step. Until it succeeds, Holdings
            stays empty even if the venue connected cleanly.
          </p>
        </div>
      </div>
      <FlowDiagram
        label="Connection lifecycle"
        steps={[
          { icon: Link2, label: "Add" },
          { icon: RefreshCw, label: "Check", accent: true },
          { icon: Eye, label: "Observe" },
          { icon: Unplug, label: "Disconnect" },
        ]}
      />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
      <ol className="stagger mt-4 grid gap-3 md:grid-cols-4" aria-label="Connection lifecycle detail">
        {LIFE.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="h-full rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <IconTile icon={Icon} accent={step.title === "Check"} />
                <p className="text-xs tracking-[0.14em] text-success uppercase">{index + 1}</p>
              </div>
              <h3 className="mt-2 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </li>
          );
        })}
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
      <div className="flex items-start gap-3">
        <IconTile icon={Wallet} accent />
        <div>
          <h2 id="shape-heading" className="text-lg font-semibold tracking-tight">
            Where balances sit
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> observations are source facts from the venue. They
            stay beside the journal so you can see what the exchange reported before anything is booked.
          </p>
        </div>
      </div>
      <FlowDiagram
        label="From Check to Holdings"
        steps={[
          { icon: RefreshCw, label: "Check" },
          { icon: Eye, label: "Observed balances", accent: true },
          { icon: Wallet, label: "Accounts" },
          { icon: BookText, label: "Journal later" },
        ]}
      />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
        <ol className="stagger grid gap-2" aria-label="From the company down to an observation">
          {HIERARCHY.map((item, index) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="rounded-xl border border-border bg-card px-4 py-3"
                style={{ marginLeft: `${index * 0.75}rem` }}
              >
                <div className="flex items-center gap-2.5">
                  <IconTile icon={Icon} accent={item.title === "Observation"} />
                  <div>
                    <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{index + 1}</p>
                    <p className="mt-0.5 font-medium">{item.title}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </li>
            );
          })}
        </ol>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Beside the read, not inside it</p>
          <ul className="mt-3 grid gap-3 text-sm">
            <li className="flex gap-2.5">
              <IconTile icon={Eye} />
              <div>
                <span className="font-medium">Observed balance</span>
                <span className="mt-1 block text-muted-foreground">
                  What the venue reported on Holdings. Can include activity that has no journal entry yet.
                </span>
              </div>
            </li>
            <li className="flex gap-2.5">
              <IconTile icon={RefreshCw} />
              <div>
                <span className="font-medium">Movement</span>
                <span className="mt-1 block text-muted-foreground">
                  A deposit, withdrawal, trade, or transfer stored as a source fact for later matching.
                </span>
              </div>
            </li>
            <li className="flex gap-2.5">
              <IconTile icon={BookText} />
              <div>
                <span className="font-medium">Journal</span>
                <span className="mt-1 block text-muted-foreground">What an accountant posted. A check never posts one.</span>
              </div>
            </li>
            <li className="flex gap-2.5">
              <IconTile icon={GitCompareArrows} />
              <div>
                <span className="font-medium">Matching</span>
                <span className="mt-1 block text-muted-foreground">
                  Compares movements with journal lines and keeps exceptions visible.
                </span>
              </div>
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
      <div className="flex items-start gap-3">
        <IconTile icon={GitCompareArrows} accent />
        <div>
          <h2 id="roles-heading" className="text-lg font-semibold tracking-tight">
            Who does what
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> once observations exist, the books catch up through
            import, journal posts, and Matching — not through another Check.
          </p>
        </div>
      </div>
      <FlowDiagram
        label="From observations to books"
        steps={[
          { icon: Eye, label: "Observed" },
          { icon: GitCompareArrows, label: "Matching", accent: true },
          { icon: BookText, label: "Journal" },
          { icon: Users, label: "Roles" },
        ]}
      />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
  const pillId = useId();

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <nav aria-label="Guide sections">
        <p className="eyebrow">On this page</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDE_SECTIONS.map((section, index) => {
            const active = section.id === selected;
            const Icon = section.icon;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setSelected(section.id)}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    active
                      ? "border-transparent font-medium text-primary-foreground"
                      : "border-border bg-card hover:border-brand",
                  )}
                >
                  {active ? (
                    <m.span
                      layoutId={pillId}
                      className="absolute inset-0 rounded-lg bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative flex size-8 shrink-0 items-center justify-center rounded-md",
                      active ? "bg-primary-foreground/15" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={1.7} aria-hidden />
                  </span>
                  <span className="relative min-w-0">
                    <span className={cn("block text-[0.65rem] tracking-[0.12em] uppercase", active ? "opacity-80" : "text-muted-foreground")}>
                      {index + 1}. {section.label}
                    </span>
                    <span className="mt-0.5 block truncate font-medium">{section.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Presence mode="wait">
        <m.div
          key={selected}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {selected === "connect" ? <ConnectSection /> : null}
          {selected === "check" ? <CheckSection /> : null}
          {selected === "balances" ? <BalancesSection /> : null}
          {selected === "next" ? <NextSection csrf={csrf} canRestartTour={canRestartTour} /> : null}
        </m.div>
      </Presence>
    </div>
  );
}
