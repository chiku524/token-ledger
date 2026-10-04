"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeConnectionTourAction } from "@/app/dashboard/tour-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WATCH_CHAIN_LABELS } from "@/data/connections";

const STEPS = [
  {
    title: "A connection only reads",
    body: "A wallet, exchange, or custodian is added as a read-only connection. Token Ledger can see balances and movements. It cannot withdraw, trade, or sign. Permissions stay read-only.",
    href: "/dashboard/settings#connections",
  },
  {
    title: "Choose how the place is held",
    body: `In Settings, watch a public address on ${WATCH_CHAIN_LABELS}. Or record an exchange account id, or a custodian vault id. A wallet also needs a type: hot, cold, or staking.`,
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

export function ConnectionTourStep({
  step,
  error,
  onBack,
  onNext,
  onFinish,
}: {
  step: number;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const current = STEPS[step];
  if (!current) return null;
  const last = step === STEPS.length - 1;

  return (
    <>
      <p className="eyebrow">
        Connection tour · {step + 1} of {STEPS.length}
      </p>
      <DialogTitle className="mt-2 text-lg font-semibold tracking-tight">{current.title}</DialogTitle>
      <DialogDescription className="mt-3 text-sm leading-relaxed">{current.body}</DialogDescription>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step > 0 ? (
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : null}
        <Button type="button" onClick={last ? onFinish : onNext}>
          {last ? "Finish" : "Next"}
        </Button>
        <Button type="button" variant="secondary" onClick={onFinish}>
          Skip
        </Button>
        {last ? (
          <a href="/dashboard/guide" className="px-2 text-sm underline">
            Open the guide
          </a>
        ) : null}
      </div>
    </>
  );
}

export function ConnectionTour({ csrf }: { csrf: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = STEPS[step]?.href.split("#")[1];
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [step, pathname]);

  if (!open || pathname.startsWith("/dashboard/setup")) return null;

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
    <Dialog open onOpenChange={(next) => (next ? undefined : void finish())}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg gap-0 p-6"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <ConnectionTourStep
          step={step}
          error={error}
          onBack={() => go(step - 1)}
          onNext={() => go(step + 1)}
          onFinish={() => void finish()}
        />
      </DialogContent>
    </Dialog>
  );
}
