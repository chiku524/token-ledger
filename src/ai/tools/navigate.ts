import { can } from "@/auth/roles";
import { isHiddenForRole } from "@/data/onboarding-sections";
import { NAV_ROUTES, navRouteBySlug } from "./routes";
import type { AgentTool, ToolResult } from "./types";

/**
 * The navigation tool: the assistant names a dashboard page and the frontend
 * moves there. The route is validated against the nav registry and the role's
 * hidden tabs before it is offered, so the assistant cannot send a user to a
 * section they cannot see (docs/ai-chatbot.md §7).
 */
export const navigate: AgentTool = {
  name: "navigate",
  description:
    "Open a dashboard page for the user. Use the route slug (for example 'matching', 'reports', 'holdings'). Returns a deep link.",
  parameters: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: `The page to open. One of: ${NAV_ROUTES.map((route) => route.slug).join(", ")}.`,
      },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  kind: "read",
  requiresConfirm: false,
  async execute(input, ctx): Promise<ToolResult> {
    const slug = String(input.slug ?? "").trim().toLowerCase();
    const route = navRouteBySlug(slug);
    if (!route) {
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
