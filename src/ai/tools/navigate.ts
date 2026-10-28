import { can } from "@/auth/roles";
import { isIndividualAccount } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import { isHiddenForRole } from "@/data/onboarding-sections";
import { isHiddenNavSlug, navRouteBySlug, navRoutesFor } from "./routes";
import type { AgentTool, ToolResult } from "./types";

/**
 * What the model is told about the navigation tool. An individual account lists
 * only the pages it has, under the names it sees ("activity", not "matching").
 */
export function navigateSpec(accountType?: OrganizationAccountType): Pick<AgentTool, "description" | "parameters"> {
  const example = isIndividualAccount(accountType) ? "'activity', 'reports', 'holdings'" : "'matching', 'reports', 'holdings'";
  return {
    description: `Open a dashboard page for the user. Use the route slug (for example ${example}). Returns a deep link.`,
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: `The page to open. One of: ${navRoutesFor(accountType)
            .map((route) => route.slug)
            .join(", ")}.`,
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  };
}

/**
 * The navigation tool: the assistant names a dashboard page and the frontend
 * moves there. The route is validated against the nav registry, the account
 * type and the role's hidden tabs before it is offered, so the assistant cannot
 * send a user to a section they cannot see (docs/ai-chatbot.md A7).
 */
export const navigate: AgentTool = {
  name: "navigate",
  ...navigateSpec(),
  kind: "read",
  requiresConfirm: false,
  async execute(input, ctx): Promise<ToolResult> {
    const slug = String(input.slug ?? "").trim().toLowerCase();
    const accountType = ctx.session.accountType;
    const route = navRouteBySlug(slug, accountType);
    if (!route) {
      // A real page this account type does not have: say so without naming it.
      if (isHiddenNavSlug(slug, accountType)) {
        const pages = navRoutesFor(accountType)
          .filter((item, index, all) => all.findIndex((other) => other.href === item.href) === index)
          .map((item) => item.label)
          .join(", ");
        return { summary: `That page isn't part of this account. You can open: ${pages}.`, route: "/dashboard" };
      }
      return { summary: `I don't know a page called "${slug}".`, route: "/dashboard" };
    }
    // Users and Onboarding are permission-gated pages, not role-hidden ones.
    if (route.permission && !can(ctx.session.role, route.permission)) {
      return { summary: `Your role cannot open ${route.label}.`, route: "/dashboard" };
    }
    if (isHiddenForRole(ctx.session.role, route.href, ctx.hiddenTabs)) {
      return { summary: `${route.label} is hidden on this workspace.`, route: "/dashboard" };
    }
    return { summary: `Opening ${route.label}.`, data: { href: route.href, label: route.label }, route: route.href };
  },
};

export const navigationTools: readonly AgentTool[] = [navigate];