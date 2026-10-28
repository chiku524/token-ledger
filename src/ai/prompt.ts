import { roleLabel } from "@/auth/roles";
import { isIndividualAccount } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import { navRoutesFor } from "./tools/routes";
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

  if (isIndividualAccount(session.accountType)) return individualPrompt(ctx, tools, role);

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

/**
 * The prompt for an individual account. It describes only the pages an
 * individual has (by name, as the sidebar shows them) and never mentions the
 * institution-only sections, so the model has nothing to suggest or link to
 * beyond them. The tool list is filtered the same way in `toolsFor`.
 */
function individualPrompt(ctx: Pick<ToolContext, "session" | "hiddenTabs">, tools: readonly ToolDefinition[], role: string): string {
  const { session } = ctx;
  const pages = navRoutesFor(session.accountType)
    .filter((route, index, all) => all.findIndex((other) => other.href === route.href) === index)
    .map((route) => route.label)
    .join(", ");

  return [
    "You are the Token Ledger assistant. You help a signed-in person understand and keep track of their own crypto holdings and activity.",
    "",
    "Doctrine (non-negotiable):",
    "- Observations are not entries. A check stores balances and movements; it never posts an entry on the Activity page.",
    "- Connections are read-only. Never suggest trading or withdrawing through Token Ledger readers.",
    "- Posts are deliberate. Activity entries and revaluations require an intentional action.",
    "- The assistant acts as the user, under the user's role. You cannot escalate privilege.",
    "- Prefer one action per turn when their records change. Always name the page to open next.",
    "",
    "Hard refusals (explain the reason, do not comply):",
    "- Never reveal sealed credentials, API secrets or signing keys.",
    "- Never sign, submit or move funds.",
    "- Never claim an entry exists that was not posted.",
    "",
    `The user is ${session.name}, role ${role}, on a personal account with one set of books.`,
    `The only pages this account has: ${pages}. Never mention, suggest or link to any other page or feature, and do not say that pages are hidden; if asked for something that is not on this list, say it is not part of this account.`,
    "",
    tools.length
      ? "Use the tools to read facts and to prepare actions. A write tool is a proposal: the user must confirm it before it runs, so explain the intended action and stop. Read tools run immediately."
      : "No tools are available for this role; answer from the conversation and general product knowledge.",
  ].join("\n");
}

/** Phrases that name a hard refusal, matched before any tool is offered. */
const REFUSAL_PATTERNS: readonly { pattern: RegExp; reason: string; institutional?: true }[] = [
  { pattern: /(reveal|show|print|give me|what is|what's).*(api[- ]?secret|secret key|private key|seed phrase|credential|password)/i, reason: "I can't reveal sealed credentials or keys." },
  { pattern: /(sign|submit|send).*(without (asking|confirming|confirmation)|automatically|silently)|(auto[- ]?sign)/i, reason: "I never sign or submit a transaction without your explicit confirmation." },
  { pattern: /(bypass|skip|ignore).*(approval|period close|quorum|segregation)/i, reason: "I can't bypass approvals, period close, or the treasury quorum.", institutional: true },
];

const INDIVIDUAL_SAFEGUARD_REFUSAL = "I can't bypass the safeguards on your account.";

/**
 * A last-resort refusal check for the clearest unsafe requests. The real
 * enforcement is the role matrix and the confirmation gate; this only stops a
 * prompt from being sent when it plainly asks for a forbidden thing.
 */
export function refusalFor(userText: string, accountType?: OrganizationAccountType): string | null {
  for (const { pattern, reason, institutional } of REFUSAL_PATTERNS) {
    if (!pattern.test(userText)) continue;
    // That wording names approvals, period close and a treasury quorum: features an individual does not have.
    return institutional && isIndividualAccount(accountType) ? INDIVIDUAL_SAFEGUARD_REFUSAL : reason;
  }
  return null;
}
