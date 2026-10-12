"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setDemoDataAction } from "@/app/dashboard/demo-actions";
import { cn } from "@/lib/utils";

/**
 * The top-bar "Demo data" switch. On, the dashboard shows the fictional example
 * books read-only; off, it returns to the organization's own books. Disabled
 * (and on) when no database is connected, since the example books are the only
 * source then.
 */
export function DemoDataToggle({
  demoOn,
  interactive,
  csrf,
}: {
  demoOn: boolean;
  interactive: boolean;
  csrf: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!interactive || pending) return;
    const data = new FormData();
    data.set("csrf", csrf);
    data.set("enabled", demoOn ? "0" : "1");
    startTransition(async () => {
      await setDemoDataAction(data);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Demo data</span>
      <button
        type="button"
        role="switch"
        aria-checked={demoOn}
        aria-label="Demo data"
        disabled={!interactive || pending}
        onClick={toggle}
        title={
          interactive
            ? demoOn
              ? "Showing the example Asset Manager A books. Click for your own books."
              : "Showing your own books. Click for the example books."
            : "No database is connected, so the example books are always shown."
        }
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          demoOn ? "bg-primary" : "bg-input",
          !interactive && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-4 rounded-full bg-background shadow transition-transform",
            demoOn ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
