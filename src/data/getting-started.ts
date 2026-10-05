import type { Role } from "@/auth/roles";
import type { BooksConnection } from "@/data/books";

/** Phases on the empty-to-value path. Later phases unlock as books fill in. */
export type GettingStartedPhase = "connect" | "check" | "holdings" | "next";

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
  next: {
    phase: "next",
    label: "Next",
    title: "When you are ready to book activity",
    body: "Observed balances are not the journal. Import or match movements when you want books to catch up — Matching compares source activity with journal lines. You can leave the guide and come back anytime from Guide.",
    href: "/dashboard/reconciliation",
    cta: "Open Matching",
  },
};

export function canTakeConnectionTour(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function activeConnections(
  connections: GettingStartedProgress["connections"],
): GettingStartedProgress["connections"] {
  return connections.filter((connection) => connection.status !== "revoked");
}

export function needsConnectionCheck(
  connections: GettingStartedProgress["connections"],
): boolean {
  return activeConnections(connections).some((connection) => connection.lastSyncedAt === null);
}

/**
 * Picks the earliest incomplete phase from live books state.
 * `holdingsSeen` is session-local: after the user confirms they found balances,
 * advance to the soft “what’s next” step without requiring a DB write.
 */
export function resolveGettingStartedPhase(
  progress: GettingStartedProgress,
  holdingsSeen = false,
): GettingStartedPhase {
  const live = activeConnections(progress.connections);
  if (live.length === 0) return "connect";
  if (needsConnectionCheck(live)) return "check";
  if (!holdingsSeen) return "holdings";
  return "next";
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
  return ["connect", "check", "holdings", "next"];
}

export function phaseIndex(phase: GettingStartedPhase): number {
  return gettingStartedPhases().indexOf(phase);
}
