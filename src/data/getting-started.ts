import type { Role } from "@/auth/roles";
import type { BooksConnection } from "@/data/books";

/** Phases on the empty-to-value path. Later phases unlock as books fill in. */
export type GettingStartedPhase =
  | "connect"
  | "check"
  | "holdings"
  | "match"
  | "journal"
  | "reports";

export type GettingStartedProgress = {
  connections: readonly Pick<BooksConnection, "status" | "lastSyncedAt">[];
  observedBalanceCount: number;
};

export type GettingStartedStep = {
  phase: GettingStartedPhase;
  /** Short label for the progress eyebrow. */
  label: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

const STEPS: Record<GettingStartedPhase, GettingStartedStep> = {
  connect: {
    phase: "connect",
    label: "Connect",
    title: "Connect a venue to start",
    body: "Add a read-only exchange, wallet, or custodian. Coinbase works with an API key or OAuth. Token Ledger can see balances and movements — it cannot withdraw, trade, or sign.",
    href: "/dashboard/setup",
    cta: "Open connection steps",
  },
  check: {
    phase: "check",
    label: "Check",
    title: "Check the connection",
    body: "Connecting alone does not pull coins. In Settings, press Check on the connection. That asks the venue’s reader and stores observed balances. Until Check succeeds, Holdings stays empty.",
    href: "/dashboard/settings#connections",
    cta: "Go to Settings",
  },
  holdings: {
    phase: "holdings",
    label: "Balances",
    title: "Your coins show on Holdings",
    body: "Open Holdings and scroll to Observed balances. That list is what the venue reported — including activity not journaled yet. Accounts under each connection are listed further down the same page.",
    href: "/dashboard/sources#observed-balances",
    cta: "Open Holdings",
  },
  match: {
    phase: "match",
    label: "Match",
    title: "Match source activity to the books",
    body: "Matching compares venue movements with journal lines. Clear exceptions or confirm matches when you are ready — nothing posts itself from a Check. Skip this if you only want to inspect holdings for now.",
    href: "/dashboard/reconciliation",
    cta: "Open Matching",
  },
  journal: {
    phase: "journal",
    label: "Journal",
    title: "Post journals deliberately",
    body: "Observations stay observed until someone posts. Use Journal to prepare or post entries (and Approvals when a draft needs a second set of eyes). A Check never creates a journal line.",
    href: "/dashboard/ledger",
    cta: "Open Journal",
  },
  reports: {
    phase: "reports",
    label: "Reports",
    title: "Read the books with Reports",
    body: "Once journals exist, Reports shows trial balance and statements, with CSV or PDF export. Combined covers multi-company FX when you need it. You can reopen this guide anytime from Guide.",
    href: "/dashboard/reports",
    cta: "Open Reports",
  },
};

/** Soft phases advanced by explicit Continue (not inferred from books). */
export const SOFT_PHASES: readonly GettingStartedPhase[] = ["holdings", "match", "journal", "reports"];

export function canTakeConnectionTour(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function activeConnections(
  connections: GettingStartedProgress["connections"],
): GettingStartedProgress["connections"] {
  return connections.filter((connection) => connection.status !== "revoked");
}

/** True when at least one live connection has never completed a Check. */
export function needsConnectionCheck(
  connections: GettingStartedProgress["connections"],
): boolean {
  return activeConnections(connections).some((connection) => connection.lastSyncedAt === null);
}

/** True when every live connection still needs its first Check. */
export function awaitingFirstSuccessfulCheck(
  connections: GettingStartedProgress["connections"],
): boolean {
  const live = activeConnections(connections);
  return live.length > 0 && live.every((connection) => connection.lastSyncedAt === null);
}

/**
 * Picks the earliest incomplete phase from live books state.
 * Once any connection has synced, soft steps unlock (Holdings → Match → Journal → Reports).
 * Remaining Waiting connections stay visible in Settings but do not trap the coach.
 */
export function resolveGettingStartedPhase(
  progress: GettingStartedProgress,
  softIndex = 0,
): GettingStartedPhase {
  const live = activeConnections(progress.connections);
  if (live.length === 0) return "connect";
  if (awaitingFirstSuccessfulCheck(live)) return "check";
  const index = Math.min(Math.max(softIndex, 0), SOFT_PHASES.length - 1);
  return SOFT_PHASES[index]!;
}

export function gettingStartedStep(
  phase: GettingStartedPhase,
  progress: GettingStartedProgress,
): GettingStartedStep {
  const step = STEPS[phase];
  if (phase !== "holdings") return step;

  if (progress.observedBalanceCount === 0) {
    return {
      ...step,
      title: "Balances land on Holdings",
      body: "After a successful Check, quantities appear under Observed balances on Holdings. If that section is still empty, the venue reported no holdings, or Check has not finished — confirm status in Settings, then refresh Holdings.",
    };
  }

  return {
    ...step,
    title: "Here are the coins you hold",
    body: `Observed balances lists ${progress.observedBalanceCount === 1 ? "1 quantity" : `${progress.observedBalanceCount} quantities`} read from your connections. That is the source of truth for what the venue holds — not market value and not the journal.`,
  };
}

export function gettingStartedPhases(): GettingStartedPhase[] {
  return ["connect", "check", "holdings", "match", "journal", "reports"];
}

export function phaseIndex(phase: GettingStartedPhase): number {
  return gettingStartedPhases().indexOf(phase);
}

export function isSoftPhase(phase: GettingStartedPhase): boolean {
  return (SOFT_PHASES as readonly string[]).includes(phase);
}

export function isLastGettingStartedPhase(phase: GettingStartedPhase): boolean {
  return phase === "reports";
}
