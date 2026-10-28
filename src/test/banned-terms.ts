/**
 * Accounting words an individual must never see in a report. Individual-facing
 * text is checked against this list in the tests, so a new report cannot slip
 * one in. The product's own name, "Token Ledger", and the blockchain "Hyperledger" are
 * proper names, not report terms.
 */
export const BANNED_REPORT_TERMS = [
  "trial balance",
  "journal",
  "debit",
  "credit",
  "ledger",
  "chart of accounts",
  "reconciliation",
  "IFRS",
  "GAAP",
  "consolidat",
  "accrual",
  "entity",
] as const;

const BANNED_PATTERN = new RegExp(BANNED_REPORT_TERMS.join("|"), "gi");

/** Journal wording that must not reach an individual outside the reports either. */
export const ENTRY_WORDING_PATTERN = /journal|posted|not journaled|unjournaled|post an entry|reverse an entry/i;

/** Every banned term found in `text`, lower-cased and de-duplicated. */
export function bannedTermsIn(text: string): string[] {
  const matches = text.replace(/Token Ledger|Hyperledger/gi, " ").match(BANNED_PATTERN);
  return matches ? [...new Set(matches.map((match) => match.toLowerCase()))] : [];
}

/** The words a person reads on a rendered page: no tags, links or scripts. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
