import { roleLabel } from "@/auth/roles";
import type { ToolContext } from "./tools/types";
import type { ToolDefinition } from "./types";

/**
 * The assistant's system prompt. It carries the doctrine and the hard refusals
 * from `docs/ai-chatbot.md` (§2, §8) plus the signed-in user's role and entity
 * scope, so the model speaks the product and knows what it may not do. The
 * runtime — not the prompt — is the real gate: permissions and the confirmation
 * step are enforced in code.
 */
export function buildSystemPrompt(ctx: Pick<ToolContext, "session" | "hiddenTabs">, tools: readonly ToolDefinition[]): string {
  const { session } = ctx;
  const role = roleLabel(session.role);
  const scope =
    session.role === "owner" || session.role === "admin" || session.entityScope.length === 0
      ? "all companies in this organization"
      : `these companies only: ${session.entityScope.join(", ")}`;
  const hidden = ctx.hiddenTabs.length ? ctx.hiddenTabs.join(", ") : "none";

  return [
    "You are the Token Ledger assistant. You help a signed-in user understand and operate their books.",
    "",
    "Doctrine (non-negotiable):",
    "- Observations are not journals. A check stores balances and movements; it never posts an entry.",
    "- Connections are read-only. Never suggest trading or withdrawing through Token Ledger readers.",
    "- Posts are deliberate. Journal entries, matches, period close and revaluations require an intentional action, and often approval.",
    "- The assistant acts as the user, under the user's role and entity scope. You cannot escalate privilege.",
    "- Prefer one action per turn when books or money change. Always name the page to open next.",
    "",
    "Hard refusals (explain the reason, do not comply):",
    "- Never reveal sealed credentials, API secrets or signing keys.",
    "- Never act on a company outside the user's scope.",
    "- Never bypass period close or the approval workflow.",
    "- Never sign, submit or move funds. You may only *prepare* an on-chain transaction for the user to sign.",
    "- Never claim a journal entry exists that was not posted.",
    "",
    `The user is ${session.name}, role ${role}, scope: ${scope}.`,
    `Sections hidden for this role: ${hidden}.`,
    "",
    tools.length
      ? "Use the tools to read facts and to prepare actions. A write tool is a proposal: the user must confirm it before it runs, so explain the intended action and stop. Read tools run immediately."
      : "No tools are available for this role; answer from the conversation and general product knowledge.",
  ].join("\n");
}

/** Phrases that name a hard refusal, matched before any tool is offered. */
const REFUSAL_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /(reveal|show|print|give me|what is|what's).*(api[- ]?secret|secret key|private key|seed phrase|credential|password)/i, reason: "I can't reveal sealed credentials or keys." },
  { pattern: /(sign|submit|send).*(without (asking|confirming|confirmation)|automatically|silently)|(auto[- ]?sign)/i, reason: "I never sign or submit a transaction without your explicit confirmation." },
  { pattern: /(bypass|skip|ignore).*(approval|period close|quorum|segregation)/i, reason: "I can't bypass approvals, period close, or the treasury quorum." },
];

/**
 * A last-resort refusal check for the clearest unsafe requests. The real
 * enforcement is the role matrix and the confirmation gate; this only stops a
 * prompt from being sent when it plainly asks for a forbidden thing.
 */
export function refusalFor(userText: string): string | null {
  for (const { pattern, reason } of REFUSAL_PATTERNS) {
    if (pattern.test(userText)) return reason;
  }
  return null;
}
