"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeConnectionTourAction } from "@/app/dashboard/tour-actions";
import { Button } from "@/components/ui/button";
import {
  gettingStartedPhases,
  gettingStartedStep,
  isLastGettingStartedPhase,
  isSoftPhase,
  phaseIndex,
  resolveGettingStartedPhase,
  type GettingStartedPhase,
  type GettingStartedProgress,
} from "@/data/getting-started";
import { cn } from "@/lib/utils";

export function ConnectionTourStep({
  phase,
  progress,
  error,
  onContinue,
  onFinish,
  onMinimize,
}: {
  phase: GettingStartedPhase;
  progress: GettingStartedProgress;
  error: string | null;
  onContinue: () => void;
  onFinish: () => void;
  onMinimize?: () => void;
}) {
  const current = gettingStartedStep(phase, progress);
  const phases = gettingStartedPhases();
  const index = phaseIndex(phase);
  const last = isLastGettingStartedPhase(phase);
  const canContinue = isSoftPhase(phase) && !last;

  return (
    <div className="flex h-full flex-col">
      <p className="eyebrow">
        Getting started · {index + 1} of {phases.length}
      </p>
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Getting started progress">
        {phases.map((item) => {
          const done = phaseIndex(item) < index;
          const active = item === phase;
          return (
            <li
              key={item}
              className={cn(
                "rounded-md px-2 py-1 text-[0.65rem] tracking-[0.12em] uppercase",
                active && "bg-primary/15 text-foreground",
                done && "bg-muted text-muted-foreground",
                !active && !done && "bg-transparent text-muted-foreground/70",
              )}
            >
              {gettingStartedStep(item, progress).label}
            </li>
          );
        })}
      </ol>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{current.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{current.body}</p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={current.href}>{current.cta}</Link>
        </Button>
        {canContinue ? (
          <Button type="button" variant="secondary" onClick={onContinue}>
            {phase === "holdings" ? "I see where balances are" : "Continue"}
          </Button>
        ) : null}
        {last ? (
          <Button type="button" variant="secondary" onClick={onFinish}>
            Finish
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onFinish}>
          Skip guide
        </Button>
        {onMinimize ? (
          <Button type="button" variant="ghost" onClick={onMinimize}>
            Hide for now
          </Button>
        ) : null}
      </div>
      {last ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Prefer the long version?{" "}
          <Link href="/dashboard/guide" className="underline">
            Open the guide
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

export function ConnectionTour({
  csrf,
  progress,
}: {
  csrf: string;
  progress: GettingStartedProgress;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [softIndex, setSoftIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const phase = resolveGettingStartedPhase(progress, softIndex);
  const step = gettingStartedStep(phase, progress);

  useEffect(() => {
    if (!open) return;
    const id = step.href.split("#")[1];
    if (!id) return;
    if (!pathname.startsWith(step.href.split("#")[0] ?? "")) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [open, pathname, step.href]);

  if (pathname.startsWith("/dashboard/setup")) return null;

  async function finish() {
    setError(null);
    const data = new FormData();
    data.set("csrf", csrf);
    try {
      await completeConnectionTourAction(data);
      setOpen(false);
      router.refresh();
    } catch {
      setError("The guide could not be saved. Refresh and try again.");
    }
  }

  function continuePhase() {
    if (!isSoftPhase(phase) || isLastGettingStartedPhase(phase)) return;
    setSoftIndex((current) => current + 1);
    setOpen(true);
  }

  if (!open) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 md:p-6">
        <Button
          type="button"
          className="pointer-events-auto shadow-lg"
          variant="secondary"
          onClick={() => setOpen(true)}
        >
          Show getting started
        </Button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Getting started guide"
      className="fixed inset-x-3 bottom-3 z-40 max-h-[min(28rem,70vh)] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-md"
    >
      <ConnectionTourStep
        phase={phase}
        progress={progress}
        error={error}
        onContinue={continuePhase}
        onFinish={() => void finish()}
        onMinimize={() => setOpen(false)}
      />
    </aside>
  );
}
