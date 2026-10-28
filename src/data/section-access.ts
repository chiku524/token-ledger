import { redirect } from "next/navigation";
import { getSession } from "@/auth/current";
import { isSectionAllowed, SECTION_REDIRECT } from "./account-sections";
import { loadOnboardingHiddenTabs } from "./onboarding";
import { isHiddenForRole } from "./onboarding-sections";

/**
 * Refuse a direct visit to a section that is hidden from the onboarding role.
 * Hiding a tab in the nav is not enough: a URL typed by hand must not render the
 * page either. Call this once at the top of every hideable page with its href.
 *
 * Two things narrow a section. An individual account has no institution-only
 * sections (Matching, Companies, Approvals, Combined, Billing and so on), whatever
 * its role. The onboarding role can additionally have sections hidden by its
 * organization. Everything else is unaffected. A missing session is handled by the
 * page's own `loadAuthorizedBooks`; here we only narrow and send the person home
 * rather than showing a forbidden page they cannot use.
 */
export async function requireSectionAccess(href: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  if (!isSectionAllowed(session.accountType, href)) redirect(SECTION_REDIRECT);
  if (session.role !== "onboarding") return;
  // The example books have no stored settings, and demo sign-in has no database.
  if (session.demo) return;
  const hidden = await loadOnboardingHiddenTabs(session.organizationId);
  if (isHiddenForRole(session.role, href, hidden)) redirect("/dashboard");
}
