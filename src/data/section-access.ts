import { redirect } from "next/navigation";
import { getSession } from "@/auth/current";
import { loadOnboardingHiddenTabs } from "./onboarding";
import { isHiddenForRole } from "./onboarding-sections";

/**
 * Refuse a direct visit to a section that is hidden from the onboarding role.
 * Hiding a tab in the nav is not enough: a URL typed by hand must not render the
 * page either. Call this once at the top of every hideable page with its href.
 *
 * Every other role is unaffected. A missing session is handled by the page's own
 * `loadAuthorizedBooks`; here we only narrow the onboarding role and send it
 * home rather than showing a forbidden page it cannot use.
 */
export async function requireSectionAccess(href: string): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "onboarding") return;
  // The example books have no stored settings, and demo sign-in has no database.
  if (session.demo) return;
  const hidden = await loadOnboardingHiddenTabs(session.organizationId);
  if (isHiddenForRole(session.role, href, hidden)) redirect("/dashboard");
}
