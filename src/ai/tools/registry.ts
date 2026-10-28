import { can } from "@/auth/roles";
import { isIndividualAccount } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import { onChainTools } from "./chain";
import { navigateSpec, navigationTools } from "./navigate";
import { readTools } from "./read";
import type { AgentTool, ToolContext } from "./types";
import { writeTools } from "./write";

/** Every registered tool, in display order. */
export const ALL_TOOLS: readonly AgentTool[] = [...navigationTools, ...readTools, ...writeTools, ...onChainTools];

export function toolByName(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/**
 * The tools an individual account may use. This is an allow-list, like the
 * section list in `account-sections.ts`: a new tool stays hidden from
 * individuals until it is added here on purpose. Matching, companies, period
 * close, billing and treasury belong to pages an individual does not have.
 */
export const INDIVIDUAL_TOOLS: readonly string[] = [
  "navigate",
  "list_holdings",
  "list_journal",
  "list_connections",
  "list_audit_events",
  "post_journal",
  "reverse_journal",
];

/** Descriptions that name the journal page, worded for an individual ("Activity"). */
const INDIVIDUAL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  list_journal: "List posted entries on the Activity page, newest first, with reference, date, memo and totals.",
  post_journal:
    "Post a balanced entry to Activity. Provide at least two lines whose debits equal credits. The entry cannot be edited once posted; correct it with a reversal.",
  reverse_journal: "Reverse a posted entry, creating the correcting entry. Requires the entry reference and a reason.",
};

/** The tool as this account type sees it: same behavior, account-appropriate wording. */
function adaptTool(tool: AgentTool, accountType: OrganizationAccountType | undefined): AgentTool {
  if (!isIndividualAccount(accountType)) return tool;
  if (tool.name === "navigate") return { ...tool, ...navigateSpec(accountType) };
  const description = INDIVIDUAL_DESCRIPTIONS[tool.name];
  return description ? { ...tool, description } : tool;
}

/**
 * The tools a session may use: a tool whose permission the role lacks is simply
 * absent, the same way the UI hides a button it cannot offer. An individual
 * account additionally gets only `INDIVIDUAL_TOOLS`. Because the runtime
 * dispatches only what this returns, a tool the model was never offered cannot
 * be run by naming it anyway. Navigation is further filtered by the onboarding
 * hidden tabs inside the tool itself (it needs the request's hidden-tab
 * selection, which is not known here).
 *
 * See docs/ai-chatbot.md A7: the assistant is not a privilege escalator.
 */
export function toolsFor(ctx: Pick<ToolContext, "session">): AgentTool[] {
  const accountType = ctx.session.accountType;
  const individual = isIndividualAccount(accountType);
  return ALL_TOOLS.filter((tool) => !tool.permission || can(ctx.session.role, tool.permission))
    .filter((tool) => !individual || INDIVIDUAL_TOOLS.includes(tool.name))
    .map((tool) => adaptTool(tool, accountType));
}

/** The tool definitions sent to the model, in the neutral shape. */
export function toolDefinitionsFor(ctx: Pick<ToolContext, "session">) {
  return toolsFor(ctx).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}