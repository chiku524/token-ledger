import { isIndividualAccount, isSectionAllowed } from "@/data/account-sections";
import type { OrganizationAccountType } from "@/data/account-type";
import { dashboardPath as toDashboardPath } from "@/data/me-paths";
import { NAV_ROUTES } from "./tools/routes";

/**
 * Keeps old conversations from leading an individual to a section their account
 * does not have. The assistant's prompt, tools and navigation already stay inside
 * the individual sections, but threads written before that (or by an organization
 * account's habits) are stored as plain text. Three places read them back: the
 * model's history, the retrieved memories, and the panel that renders a restored
 * thread. Each goes through here, so a stored link to Matching or Companies is not
 * fed to the model as an example to follow, and is never drawn as a link.
 *
 * Limits: this removes links and `/dashboard/...` paths to hidden sections, and it
 * drops whole memories that name one. It does not rewrite a section name used in
 * plain prose in a restored message ("Matching shows exceptions"), because the same
 * words ("matching", "operations") are ordinary English and rewriting them would
 * corrupt unrelated text. Organizations are never touched.
 */

/** Said in place of a removed link or path. Neutral: it does not say what was removed. */
export const HIDDEN_SECTION_PLACEHOLDER = "a page that is not part of this account";

/** Section names an individual does not have, lower-cased, taken from the nav registry so a new hidden section is covered. */
const HIDDEN_NAMES: readonly string[] = [
  ...new Set(
    NAV_ROUTES.filter((route) => !isSectionAllowed("individual", route.href)).flatMap((route) => [route.slug, route.label.toLowerCase()]),
  ),
];

const HIDDEN_NAME_PATTERN = new RegExp(`\\b(${HIDDEN_NAMES.map(escapeRegExp).join("|")})\\b`, "i");

/** A markdown link, `[text](target "title")`. The text may name a hidden section, so the whole link goes. */
const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * A bare dashboard path or URL, as in `/dashboard/reconciliation?tab=1` or `https://host/dashboard/entities`. */
const DASHBOARD_REFERENCE = /(?:https?:\/\/[^\s)<>\]"']+?)?\/dashboard(?:\/[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)*(?:[?#][^\s)<>\]"']*)?/g;

/** The same, written as an individual's address: `/me/matching` or `https://host/me/people`. Not `/memo` or `/home/me/x`. */
const ME_REFERENCE = /(?:https?:\/\/[^\s)<>\]"'/]+|(?<![\w/.~-]))\/me(?![\w~-])(?:\/[A-Za-z0-9_~-]+(?:\.[A-Za-z0-9_~-]+)*)*(?:[?#][^\s)<>\]"']*)?/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The dashboard path inside a link target (an `/me` address counts as its dashboard page), or null when the target is neither. */
function dashboardPath(target: string): string | null {
  const match = /(?:^|^https?:\/\/[^/\s]+)(\/dashboard(?:[/?#].*)?)$/i.exec(target.trim());
  if (match) return match[1] ?? null;
  const me = /(?:^|^https?:\/\/[^/\s]+)(\/me(?:[/?#].*)?)$/i.exec(target.trim());
  return me?.[1] ? toDashboardPath(me[1]) : null;
}

/** Whether a dashboard reference points at a section this account type does not have. */
function isHiddenReference(reference: string, accountType: OrganizationAccountType | undefined): boolean {
  const path = dashboardPath(reference);
  return path !== null && !isSectionAllowed(accountType, path);
}

/**
 * `text` with every link or path to a section an individual does not have replaced
 * by a neutral phrase. Links to allowed sections, other links and all other text
 * are unchanged, and so is any text for an organization.
 */
export function scrubHiddenSectionLinks(text: string, accountType: OrganizationAccountType | undefined): string {
  if (!isIndividualAccount(accountType)) return text;
  const withoutLinks = text.replace(MARKDOWN_LINK, (whole, target: string) =>
    isHiddenReference(target, accountType) ? HIDDEN_SECTION_PLACEHOLDER : whole,
  );
  const scrub = (reference: string) => (isHiddenReference(reference, accountType) ? HIDDEN_SECTION_PLACEHOLDER : reference);
  return withoutLinks.replace(DASHBOARD_REFERENCE, scrub).replace(ME_REFERENCE, scrub);
}

/** Whether `text` links to or names a section an individual does not have. Always false for an organization. */
export function mentionsHiddenSection(text: string, accountType: OrganizationAccountType | undefined): boolean {
  if (!isIndividualAccount(accountType)) return false;
  return HIDDEN_NAME_PATTERN.test(text) || scrubHiddenSectionLinks(text, accountType) !== text;
}

/**
 * Stored messages as they may be shown to, or sent to the model for, this account
 * type. The assistant's own text (and a tool's) is scrubbed; the person's own words
 * are left exactly as they typed them.
 */
export function scrubStoredMessages<T extends { role: string; content: string }>(
  messages: readonly T[],
  accountType: OrganizationAccountType | undefined,
): T[] {
  if (!isIndividualAccount(accountType)) return [...messages];
  return messages.map((message) =>
    message.role === "user" ? message : { ...message, content: scrubHiddenSectionLinks(message.content, accountType) },
  );
}

/** Retrieved memories this account type may be shown: any that name or link a hidden section are dropped. */
export function filterMemoriesFor<T extends { content: string }>(memories: readonly T[], accountType: OrganizationAccountType | undefined): T[] {
  if (!isIndividualAccount(accountType)) return [...memories];
  return memories.filter((memory) => !mentionsHiddenSection(memory.content, accountType));
}
