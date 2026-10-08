import { can } from "@/auth/roles";
import { onChainTools } from "./chain";
import { navigationTools } from "./navigate";
import { readTools } from "./read";
import type { AgentTool, ToolContext } from "./types";
import { writeTools } from "./write";

/** Every registered tool, in display order. */
export const ALL_TOOLS: readonly AgentTool[] = [...navigationTools, ...readTools, ...writeTools, ...onChainTools];

export function toolByName(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/**
 * The tools a session may use: a tool whose permission the role lacks is simply
 * absent, the same way the UI hides a button it cannot offer. Navigation is
 * additionally filtered by the onboarding hidden tabs inside the tool itself
 * (it needs the request's hidden-tab selection, which is not known here).
 *
 * See docs/ai-chatbot.md §7: the assistant is not a privilege escalator.
 */
export function toolsFor(ctx: Pick<ToolContext, "session">): AgentTool[] {
  return ALL_TOOLS.filter((tool) => !tool.permission || can(ctx.session.role, tool.permission));
}

/** The tool definitions sent to the model, in the neutral shape. */
export function toolDefinitionsFor(ctx: Pick<ToolContext, "session">) {
  return toolsFor(ctx).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}
