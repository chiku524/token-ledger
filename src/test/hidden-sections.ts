/**
 * Names of the sections an individual account does not have. A test uses this to
 * check that no user-facing text for an individual mentions or links to them.
 */
export const HIDDEN_SECTION_PATTERN =
  /\b(matching|reconciliation|companies|approvals?|combined|consolidation|billing|treasury|payables|operations|onboarding)\b|\/dashboard\/(reconciliation|entities|approvals|consolidation|billing|treasury|payables|operations|onboarding)/i;

/** Every hidden-section name or link found in `text`, lower-cased and de-duplicated. */
export function hiddenSectionsIn(text: string): string[] {
  const matches = text.match(new RegExp(HIDDEN_SECTION_PATTERN.source, "gi"));
  return matches ? [...new Set(matches.map((match) => match.toLowerCase()))] : [];
}