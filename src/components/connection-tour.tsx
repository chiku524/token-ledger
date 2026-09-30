"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeConnectionTourAction } from "@/app/dashboard/tour-actions";

const STEPS = [
  {
    title: "A connection only reads",
    body: "A wallet, exchange, or custodian is added as a read-only connection. Token Ledger can see balances and movements. It cannot withdraw, trade, or sign, and it does not store an API key.",
    href: "/dashboard/settings#connections",
  },
  {
    title: "Choose how the place is held",
    body: "In Settings, watch a public address on Ethereum, Solana, or Polygon. Or record an exchange account id, or a custodian vault id. A wallet also needs a type: hot, cold, or staking.",
    href: "/dashboard/settings#wallet",
  },
  {
    title: "One connection, several accounts",
    body: "The connection is the grant. The accounts under it are the addresses, sub-accounts, or vaults. Waiting means it has not been checked yet. Up to date means the last check succeeded. Needs attention means a later check failed. Disconnected means future reads have stopped.",
    href: "/dashboard/settings#connections",
  },
  {
    title: "Check, then compare with the books",
    body: "Check asks that venue’s reader. Until the reader is live, nothing is sent and the connection stays waiting. Observed balances are what was read, including activity that is not in the journal yet. Booked value is what an accountant has posted.",
    href: "/dashboard/sources#observed-balances",
  },
  {
    title: "Disconnect leaves the history",
    body: "Disconnect stops future reads. Past observations and the journal stay. The guide shows the same path as a diagram, including who is allowed to add a connection.",
    href: "/dashboard/guide",
  },
] as const;

export function ConnectionTour({ csrf }: { csrf: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = STEPS[step];

  useEffect(() => {
    const id = STEPS[step]?.href.split("#")[1];
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [step, pathname]);

  if (!open || !current || pathname.startsWith("/dashboard/setup")) return null;

  async function finish() {
    setError(null);
    const data = new FormData();
    data.set("csrf", csrf);
    try {
      await completeConnectionTourAction(data);
      setOpen(false);
      router.refresh();
    } catch {
      setError("The tour could not be saved. Refresh and try again.");
    }
  }

  function go(next: number) {
    const target = STEPS[next];
    if (!target) return;
    setStep(next);
    router.push(target.href);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm md:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-tour-title"
        className="panel w-full max-w-lg p-6"
      >
        <p className="kicker">
          Connection tour · {step + 1} of {STEPS.length}
        </p>
        <h2 id="connection-tour-title" className="mt-2 text-lg font-semibold tracking-tight">
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{current.body}</p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-seal">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => go(step - 1)}>
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn" onClick={() => go(step + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void finish()}>
              Finish
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => void finish()}>
            Skip
          </button>
          {step === STEPS.length - 1 ? (
            <a href="/dashboard/guide" className="px-2 text-sm underline">
              Open the guide
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
