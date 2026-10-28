import { can } from "@/auth/roles";
import { isIndividualAccount } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import { pathFor } from "@/data/me-paths";
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
 * individuals until it is added here on purpose. Every tool here only reads:
 * posting and reversing entries, matching, companies, period close, billing and
 * treasury belong to features an individual does not have.
 */
export const INDIVIDUAL_TOOLS: readonly string[] = [
  "navigate",
  "list_holdings",
  "list_activity",
  "list_connections",
  "list_audit_events",
];

/** Tools that only exist for an individual: an organization's tool list stays exactly as it was. */
const INDIVIDUAL_ONLY_TOOLS: readonly string[] = ["list_activity"];

/**
 * Descriptions worded for an individual. The Activity page is read-only, so there
 * is no tool to post or reverse an entry; `list_activity` reads what wallets and
 * exchanges reported.
 */
const INDIVIDUAL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  list_holdings: "List balances by asset, the latest reading per account, as reported by connected wallets and exchanges.",
};

/** The tool as this account type sees it: same behavior, account-appropriate wording. */
function adaptTool(tool: AgentTool, accountType: OrganizationAccountType | undefined): AgentTool {
  if (!isIndividualAccount(accountType)) return tool;
  const adapted = tool.name === "navigate" ? { ...tool, ...navigateSpec(accountType) } : tool;
  const description = INDIVIDUAL_DESCRIPTIONS[tool.name];
  return { ...adapted, ...(description ? { description } : {}), execute: withOwnAddress(adapted, accountType) };
}

/**
 * Run the tool and give its deep link in the account's own address. The tools name
 * a page once, as `/dashboard/...`; an individual's link is the same page under
 * `/me`, so following it does not cost a redirect.
 */
function withOwnAddress(tool: AgentTool, accountType: OrganizationAccountType | undefined): AgentTool["execute"] {
  return async (input, ctx) => {
    const result = await tool.execute(input, ctx);
    return result.route ? { ...result, route: pathFor(accountType, result.route) } : result;
  };
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
    .filter((tool) => individual || !INDIVIDUAL_ONLY_TOOLS.includes(tool.name))
    .map((tool) => adaptTool(tool, accountType));
}

/** The tool definitions sent to the model, in the neutral shape. */
export function toolDefinitionsFor(ctx: Pick<ToolContext, "session">) {
  return toolsFor(ctx).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}