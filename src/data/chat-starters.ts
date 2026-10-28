import { isIndividualAccount } from "./account-sections";
import type { OrganizationAccountType } from "./account-type";

/**
 * The suggestion chips on an empty assistant thread, matching docs/ai-chatbot.md A6.
 * An individual account is offered only pages and ideas it has: there is no
 * Matching to open and no unmatched movements to review.
 */
const ORGANIZATION_STARTERS = [
  "Open matching",
  "Summarize the books this month",
  "Show unmatched movements this week",
  "Why is this connection still Waiting?",
] as const;

const INDIVIDUAL_STARTERS = [
  "Open holdings",
  "Summarize my holdings",
  "Show my latest activity",
  "Why is this connection still Waiting?",
] as const;

export function starterPromptsFor(accountType?: OrganizationAccountType): readonly string[] {
  return isIndividualAccount(accountType) ? INDIVIDUAL_STARTERS : ORGANIZATION_STARTERS;
}