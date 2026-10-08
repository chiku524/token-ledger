/**
 * Persistence for the onboarding role's hidden navigation sections. The catalog
 * and pure rules live in `./onboarding-sections` so the client nav can import
 * them without a database.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizationSettings } from "@/db/schema";
import { parseHiddenTabs, serializeHiddenTabs } from "./onboarding-sections";

/**
 * The hidden-tab selection for an organization. Empty when none is stored.
 * Cached per request so the layout and a page guard share one query.
 */
export const loadOnboardingHiddenTabs = cache(async (organizationId: string): Promise<string[]> => {
  const db = getDb();
  const [row] = await db
    .select({ hidden: organizationSettings.onboardingHiddenTabs })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  return parseHiddenTabs(row?.hidden);
});

/** Replace the hidden-tab selection for an organization. */
export async function saveOnboardingHiddenTabs(organizationId: string, hrefs: readonly string[]): Promise<void> {
  const db = getDb();
  const value = serializeHiddenTabs(hrefs);
  await db
    .insert(organizationSettings)
    .values({ organizationId, onboardingHiddenTabs: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { onboardingHiddenTabs: value, updatedAt: new Date() },
    });
}
