"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toolLabel, type ToolPreview } from "./chat-adapter";

interface ToolResult {
  summary?: string;
  route?: string | null;
  text?: string;
  auditEventId?: string | null;
}

/** Read a preview off the tool-call args, tolerating an absent one. */
function previewFrom(args: unknown): ToolPreview | null {
  if (!args || typeof args !== "object") return null;
  const candidate = (args as { preview?: unknown }).preview;
  return candidate && typeof candidate === "object" ? (candidate as ToolPreview) : null;
}

/** The audit event / tool name carried on a settled decision's args. */
function auditHintFrom(args: unknown): { auditEventId?: string; tool?: string } {
  if (!args || typeof args !== "object") return {};
  const record = args as { auditEventId?: unknown; tool?: unknown };
  return {
    auditEventId: typeof record.auditEventId === "string" ? record.auditEventId : undefined,
    tool: typeof record.tool === "string" ? record.tool : undefined,
  };
}

/** The key fields of a proposed action (entity, amount, date, counterparty). */
function PreviewFields({ preview }: { preview: ToolPreview }) {
  if (preview.fields.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {preview.fields.map((field) => (
        <div key={field.label} className="col-span-2 grid grid-cols-[auto_1fr] gap-x-3">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="truncate font-mono text-foreground">{field.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The proposed journal lines and whether they balance. */
function PreviewLines({ preview }: { preview: ToolPreview }) {
  if (!preview.lines?.length) return null;
  const debit = preview.lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const credit = preview.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Account</th>
            <th className="px-2 py-1 text-left font-medium">Side</th>
            <th className="px-2 py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {preview.lines.map((line, index) => (
            <tr key={`${line.accountCode}-${index}`} className="border-t border-border">
              <td className="px-2 py-1 font-mono">{line.accountCode}</td>
              <td className="px-2 py-1 capitalize text-muted-foreground">{line.side}</td>
              <td className="px-2 py-1 text-right font-mono tabular-nums">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={cn("px-2 py-1 text-xs", preview.balanced ? "text-[color:var(--chart-2)]" : "text-destructive")}>
        {preview.balanced
          ? `Balanced: debits ${debit} = credits ${credit}`
          : `Not balanced: debits ${debit} ≠ credits ${credit}`}
      </p>
    </div>
  );
}

/** The on-chain transaction the user will sign, and the signing handoff. */
function PreviewPlan({ preview, route }: { preview: ToolPreview; route?: string }) {
  const router = useRouter();
  if (!preview.plan) return null;
  const plan = preview.plan;
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
      <p className="label-caps text-muted-foreground">Transaction to sign</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">Action</dt>
        <dd className="font-mono">{plan.action}</dd>
        <dt className="text-muted-foreground">Cluster</dt>
        <dd className="font-mono">{plan.cluster}</dd>
        <dt className="text-muted-foreground">Fee payer</dt>
        <dd className="truncate font-mono">{plan.feePayer}</dd>
        {plan.subject ? (
          <>
            <dt className="text-muted-foreground">Subject</dt>
            <dd className="truncate font-mono">{plan.subject}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Instructions</dt>
        <dd className="font-mono">{plan.instructions}</dd>
      </dl>
      {plan.policyNote ? <p className="mt-1 text-muted-foreground">{plan.policyNote}</p> : null}
      <p className="mt-1.5">
        The assistant never signs. Confirm, then sign in the app
        {route ? (
          <>
            {": "}
            <button
              type="button"
              onClick={() => router.push(route)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Open {route.includes("treasury") ? "Treasury" : "Billing"}
              <ExternalLink className="size-3" aria-hidden />
            </button>
          </>
        ) : (
          " (Billing or Treasury)."
        )}
      </p>
    </div>
  );
}

/** A link to the History page, filtered to the recorded action, after a write. */
function AuditLink({ filter }: { filter?: string }) {
  const router = useRouter();
  if (!filter) return null;
  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboard/audit?action=${encodeURIComponent(filter)}`)}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      View in History
      <ExternalLink className="size-3" aria-hidden />
    </button>
  );
}

/**
 * The single tool-call renderer. It covers both shapes our assistant emits:
 *
 * - A **read/prepare** tool that already ran: shows the summary and, if it
 *   carries a route, a deep link into the dashboard.
 * - A **pending write**, which arrives as an `approval` gate: shows what it will
 *   do — key fields, balanced journal lines, or the on-chain plan — then Confirm
 *   and Cancel. Confirm calls `respondToApproval({ approved: true })`, which
 *   resumes the run; the adapter posts the decision to our confirm action, the
 *   only path that runs the write. A settled gate becomes a receipt that links to
 *   History.
 *
 * See docs/ai-chatbot.md §5 and docs/AI-09 (#277).
 */
export function ChatToolCard({ toolName, args, result, approval, respondToApproval, status }: ToolCallMessagePartProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const output = (result ?? {}) as ToolResult;
  const preview = previewFrom(args);
  const auditHint = auditHintFrom(args);

  // A pending gate: the user must decide before anything runs.
  if (approval) {
    const decided = approval.approved !== undefined || approval.resolution !== undefined;
    return (
      <div className="my-2 rounded-xl border border-border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-[color:var(--chart-4)]" aria-hidden />
          <span className="font-medium">{preview?.action ?? toolLabel(toolName)}</span>
          <span className="label-caps text-muted-foreground">needs your confirmation</span>
        </div>
        {preview ? (
          <>
            <PreviewFields preview={preview} />
            <PreviewLines preview={preview} />
            <PreviewPlan preview={preview} route={output.route ?? undefined} />
            {preview.note ? <p className="mt-2 text-xs text-muted-foreground">{preview.note}</p> : null}
          </>
        ) : (
          <p className="mt-1.5 text-muted-foreground">
            {approval.prompt ?? "This changes the books. Review and confirm to run it."}
          </p>
        )}
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={cn("flex items-center gap-1.5 text-xs", approval.approved ? "text-[color:var(--chart-2)]" : "text-muted-foreground")}>
              {approval.approved ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {approval.approved ? `Confirmed${output.text ? ` — ${output.text}` : ""}` : "Cancelled"}
            </p>
            {approval.approved ? (
              <span className="flex items-center gap-3">
                <AuditLink filter={auditHint.tool ? `assistant.${auditHint.tool}` : undefined} />
                {output.route ? (
                  <button
                    type="button"
                    onClick={() => router.push(output.route as string)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View
                    <ExternalLink className="size-3" aria-hidden />
                  </button>
                ) : null}              </span>
            ) : null}
          </div>
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
