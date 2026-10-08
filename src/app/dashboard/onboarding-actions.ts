"use server";

import { actorName, assertCsrf, AuthError, requirePermission } from "@/auth/current";
import { ONBOARDING_SECTIONS } from "@/data/onboarding-sections";
import { saveOnboardingHiddenTabs } from "@/data/onboarding";
import { canWriteBooks } from "@/data/authorized-books";
import { writeAudit } from "@/db/auth-store";
import { fail, finish, save } from "./form-state";

const PATH = "/dashboard/onboarding";
const READ_ONLY = "Connect a database to change onboarding access. This demo does not save it.";

/**
 * Save which tabs are hidden from the onboarding role. Only an owner or admin
 * (`onboarding.manage`) may change this. The submitted hrefs are intersected
 * with the known section catalog, so an unknown or always-visible tab cannot be
 * hidden.
 */
export async function saveOnboardingTabsAction(formData: FormData): Promise<void> {
  let session;
  try {
    await assertCsrf(formData);
    session = await requirePermission("onboarding.manage");
  } catch (error) {
    if (error instanceof AuthError) fail(PATH, error.message);
    throw error;
  }
  if (!canWriteBooks(session)) fail(PATH, READ_ONLY);

  const submitted = formData.getAll("hidden").map((value) => String(value));
  const known = new Set(ONBOARDING_SECTIONS.map((section) => section.href));
  const hidden = submitted.filter((href) => known.has(href));

  await save(PATH, () => saveOnboardingHiddenTabs(session.organizationId, hidden));
  await writeAudit({
    organizationId: session.organizationId,
    actor: actorName(session),
    action: "onboarding.tabs_changed",
    subjectType: "organization",
    subjectId: session.organizationId,
    detail:
      hidden.length === 0
        ? "No tabs hidden from the onboarding role."
        : `Hidden from onboarding: ${hidden.join(", ")}.`,
  });
  finish(
    PATH,
    hidden.length === 0
      ? "The onboarding role now sees every tab."
      : `Updated ${hidden.length} hidden tab${hidden.length === 1 ? "" : "s"}.`,
  );
}
