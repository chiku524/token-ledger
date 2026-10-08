"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toolLabel } from "./chat-adapter";

interface ToolResult {
  summary?: string;
  route?: string | null;
  text?: string;
}

/**
 * The single tool-call renderer. It covers both shapes our assistant emits:
 *
 * - A **read/prepare** tool that already ran: shows the summary and, if it
 *   carries a route, a deep link into the dashboard.
 * - A **pending write**, which arrives as an `approval` gate: shows Confirm and
 *   Cancel. Confirm calls `respondToApproval({ approved: true })`, which resumes
 *   the run; the adapter then posts the decision to our confirm action, the only
 *   path that runs the write. A settled gate becomes a receipt.
 *
 * See docs/ai-chatbot.md §5 and docs/adr-ai-assistant.md.
 */
export function ChatToolCard({ toolName, result, approval, respondToApproval, status }: ToolCallMessagePartProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const output = (result ?? {}) as ToolResult;

  // A pending gate: the user must decide before anything runs.
  if (approval) {
    const decided = approval.approved !== undefined || approval.resolution !== undefined;
    return (
      <div className="my-2 rounded-xl border border-border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-[color:var(--chart-4)]" aria-hidden />
          <span className="font-medium">{toolLabel(toolName)}</span>
          <span className="label-caps text-muted-foreground">needs your confirmation</span>
        </div>
        <p className="mt-1.5 text-muted-foreground">{approval.prompt ?? "This changes the books. Review and confirm to run it."}</p>
        {!decided ? (
          <>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setError(null);
                  void respondToApproval({ approved: true }).catch((failure: unknown) =>
                    setError(failure instanceof Error ? failure.message : String(failure)),
                  );
                }}
              >
                Confirm
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(null);
                  void respondToApproval({ approved: false, reason: "Cancelled by the user." }).catch((failure: unknown) =>
                    setError(failure instanceof Error ? failure.message : String(failure)),
                  );
                }}
              >
                Cancel
              </Button>
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
          </>
        ) : (
          <p className={cn("mt-3 flex items-center gap-1.5 text-xs", approval.approved ? "text-[color:var(--chart-2)]" : "text-muted-foreground")}>
            {approval.approved ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            {approval.approved ? `Confirmed${output.text ? ` — ${output.text}` : ""}` : "Cancelled"}
          </p>
        )}
      </div>
    );
  }

  // A tool still running (no result yet).
  if (output.summary === undefined && status.type === "running") {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {toolLabel(toolName)}…
      </div>
    );
  }

  // A settled read/prepare result.
  return (
    <div className="my-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <Check className="size-4 text-[color:var(--chart-2)]" aria-hidden />
        <span className="font-medium">{toolLabel(toolName)}</span>
      </div>
      {output.summary ? <p className="mt-1.5 text-muted-foreground">{output.summary}</p> : null}
      {output.route ? (
        <button
          type="button"
          onClick={() => router.push(output.route as string)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open page
          <ExternalLink className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
