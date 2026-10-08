import type { SessionUser } from "@/auth/current";
import type { Permission } from "@/auth/roles";
import type { Books } from "@/data/books";
import type { JsonSchema } from "../types";

/**
 * What a tool may see. The books are already scoped to the session's entities,
 * and `hiddenTabs` is the onboarding role's hidden sections — so a tool cannot
 * widen what the user can reach. See docs/ai-chatbot.md §7.
 */
export interface ToolContext {
  session: SessionUser;
  books: Books;
  hiddenTabs: readonly string[];
  /**
   * The request's CSRF token, so an on-chain prepare tool can call the existing
   * prepare server action through FormData with the same CSRF guard the UI uses.
   * Null when there is no request (a cron or a test), in which case on-chain
   * tools decline instead of bypassing the guard.
   */
  csrf: string | null;
}

/** The outcome of a tool run. `route` is a deep link to the affected page. */
export interface ToolResult {
  /** A short human-readable summary the assistant can quote. */
  summary: string;
  /** Structured data for the model and the confirmation card. */
  data?: unknown;
  /** A dashboard route to offer as a deep link. */
  route?: string;
  /** The audit event written when the tool ran, for a deep link to History. */
  auditEventId?: string | null;
}

/** One labeled value shown on a confirmation card. */
export interface ToolPreviewField {
  label: string;
  value: string;
}

/** One line of a proposed journal entry. */
export interface ToolPreviewLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: string;
}

/**
 * A summary of what a write will do, produced *before* it runs, so the user can
 * review it on the confirmation card. It must be side-effect-free: generating a
 * preview never posts, matches, closes, or persists. See AI-09 (#277).
 */
export interface ToolPreview {
  /** A human label for the action, e.g. "Post journal". */
  action: string;
  /** The key fields of the intended action (entity, date, amount, counterparty). */
  fields: ToolPreviewField[];
  /** For a journal: the proposed lines. */
  lines?: ToolPreviewLine[];
  /** For a journal: whether debits equal credits. */
  balanced?: boolean;
  /** For an on-chain prepare: the transaction the user will sign. */
  plan?: {
    action: string;
    cluster: string;
    programId: string;
    feePayer: string;
    subject?: string | null;
    policyNote?: string;
    instructions: number;
  };
  /** A one-line statement of the side effect. */
  note?: string;
}

/**
 * One assistant tool. A read tool runs immediately and returns facts. A write
 * tool is recorded as a proposal and only runs after the user confirms; the
 * runtime never runs a write without an explicit confirmation turn.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  kind: "read" | "write";
  /** True for a write that must be confirmed. Reads are never confirmed. */
  requiresConfirm: boolean;
  /** The permission the caller must hold. Absent means any signed-in session. */
  permission?: Permission;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
  /**
   * A side-effect-free summary of what `execute` will do, for the confirmation
   * card. Write tools provide it; it must never change state.
   */
  preview?(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolPreview>;
}
