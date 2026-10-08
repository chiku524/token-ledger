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
}
