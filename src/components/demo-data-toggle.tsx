"use client";

import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { setDemoDataAction } from "@/app/dashboard/demo-actions";
import { cn } from "@/lib/utils";

/**
 * The top-bar "Demo data" switch. On, the dashboard shows the fictional example
 * books read-only; off, it returns to the organization's own books. Disabled
 * (and on) when no database is connected, since the example books are the only
 * source then.
 *
 * It is a form posting to the server action, which sets the cookie and redirects
 * back here, so the refreshed request reads the new cookie and the pages swap.
 */
function Switch({ demoOn, interactive }: { demoOn: boolean; interactive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={demoOn}
      aria-label="Demo data"
      disabled={!interactive || pending}
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
        pending && "opacity-70",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow transition-transform",
          demoOn ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function DemoDataToggle({
  demoOn,
  interactive,
  csrf,
}: {
  demoOn: boolean;
  interactive: boolean;
  csrf: string;
}) {
  const pathname = usePathname();
  return (
    <form action={setDemoDataAction} className="flex items-center gap-1.5">
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Demo data</span>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="enabled" value={demoOn ? "0" : "1"} />
      <input type="hidden" name="next" value={pathname} />
      <Switch demoOn={demoOn} interactive={interactive} />
    </form>
  );
}
