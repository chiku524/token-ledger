/** Sections for the in-app Guide / AI chatbot capability handbook. */
import { isIndividualAccount, journalName } from "./account-sections";
import type { OrganizationAccountType } from "./account-type";

export type GuideSectionId =
  | "doctrine"
  | "first-run"
  | "capabilities"
  | "prompts"
  | "refusals"
  | "connections";

export type GuideSection = {
  id: GuideSectionId;
  emoji: string;
  label: string;
  title: string;
  blurb: string;
};

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "doctrine",
    emoji: "🧭",
    label: "Doctrine",
    title: "Observations stay observed",
    blurb: "The chatbot follows the same ledger rules as the UI — reads never post journals.",
  },
  {
    id: "first-run",
    emoji: "🚀",
    label: "First run",
    title: "Connect → Check → Holdings",
    blurb: "The path every new org should take before Matching or Reports.",
  },
  {
    id: "capabilities",
    emoji: "🗺️",
    label: "Capabilities",
    title: "Anything you can do, you can ask",
    blurb: "Reports, matching, connections, journal, treasury — gated by your role.",
  },
  {
    id: "prompts",
    emoji: "💬",
    label: "Prompts",
    title: "Example things to say",
    blurb: "Natural language that maps to real dashboard actions.",
  },
  {
    id: "refusals",
    emoji: "🚫",
    label: "Refusals",
    title: "What the assistant will not do",
    blurb: "No privilege escalation, no invented journals, no source-side spending.",
  },
  {
    id: "connections",
    emoji: "🔌",
    label: "Connections",
    title: "Where a connection sits",
    blurb: "Read-only consent for a company — wallets, exchanges, and custodians.",
  },
] as const;

export const FIRST_RUN_STEPS = [
  { emoji: "1️⃣", title: "Sign in", detail: "Owner creates the org; others join by invite." },
  { emoji: "2️⃣", title: "Connect", detail: "Wallet, exchange, or custodian — often starts as Waiting." },
  { emoji: "3️⃣", title: "Check", detail: "Settings → Check. Connect alone does not pull coins." },
  { emoji: "4️⃣", title: "Holdings", detail: "Observed balances show what the venue reported." },
  { emoji: "5️⃣", title: "Match / Journal", detail: "Deliberate posts and matching — never automatic from a Check." },
  { emoji: "6️⃣", title: "Reports", detail: "Trial balance, statements, CSV/PDF once books exist." },
] as const;

export const CAPABILITY_GROUPS = [
  {
    emoji: "🔌",
    title: "Sources & holdings",
    items: ["Add / Check / disconnect connections", "Observed balances", "CSV import", "Refresh prices"],
  },
  {
    emoji: "📘",
    title: "Journal & approvals",
    items: ["Prepare drafts", "Approve", "Post", "Reverse with a note"],
  },
  {
    emoji: "🔗",
    title: "Matching & close",
    items: ["Auto / manual match", "Unmatch", "Close or reopen a period"],
  },
  {
    emoji: "📊",
    title: "Reports & combined",
    items: ["Trial balance & statements", "CSV / PDF export", "Revaluation", "Multi-entity FX"],
  },
  {
    emoji: "⛓️",
    title: "On-chain",
    items: ["Billing vaults", "Treasury", "Payables proposals"],
  },
  {
    emoji: "🛠️",
    title: "Ops & people",
    items: ["Sync health", "Audit history", "Users & invites", "Onboarding tabs"],
  },
] as const;

export const EXAMPLE_PROMPTS = [
  { tone: "Getting started", text: "I connected Coinbase — why don’t I see coins?" },
  { tone: "Reports", text: "Generate last month’s trial balance as CSV." },
  { tone: "Matching", text: "Show unmatched USDC movements this week." },
  { tone: "Explain", text: "What does Observed balance mean?" },
  { tone: "Ops", text: "Why did the last BitGo sync fail?" },
  { tone: "Close", text: "Close March once matching is clean." },
] as const;

export const REFUSALS = [
  { emoji: "🔏", title: "Move funds on read-only sources", detail: "Exchanges and custodians stay viewer-scoped." },
  { emoji: "🪄", title: "Invent posted journals", detail: "Observations never become books without a deliberate post." },
  { emoji: "🔓", title: "Bypass Approvals or period close", detail: "Control environment stays intact." },
  { emoji: "🗝️", title: "Reveal sealed credentials", detail: "API secrets stay encrypted at rest." },
  { emoji: "🏢", title: "Cross entity or role walls", detail: "Session scope and RBAC always apply." },
] as const;

/*
 * The same handbook for an individual account. An individual has no Matching,
 * Companies, Approvals, Combined, Billing, Treasury, Payables, Operations or
 * Onboarding pages (see `account-sections.ts`), so the guide neither describes
 * nor points to them, and the journal page is called Activity. Organizations
 * keep the exports above unchanged.
 */

type GuideStep = { emoji: string; title: string; detail: string };
type CapabilityGroup = { emoji: string; title: string; items: readonly string[] };
type ExamplePrompt = { tone: string; text: string };
type Refusal = { emoji: string; title: string; detail: string };

const INDIVIDUAL_BLURBS: Partial<Record<GuideSectionId, string>> = {
  doctrine: "The chatbot follows the same rules as the app \u2014 reading never posts an entry.",
  "first-run": "The path to take before Activity or Reports.",
  capabilities: "Holdings, connections, activity, and reports \u2014 gated by your role.",
  refusals: "No privilege escalation, no invented entries, no source-side spending.",
  connections: "Read-only consent for your account \u2014 wallets, exchanges, and custodians.",
};

export function guideSectionsFor(accountType?: OrganizationAccountType): readonly GuideSection[] {
  if (!isIndividualAccount(accountType)) return GUIDE_SECTIONS;
  return GUIDE_SECTIONS.map((section) => ({ ...section, blurb: INDIVIDUAL_BLURBS[section.id] ?? section.blurb }));
}

export function firstRunStepsFor(accountType?: OrganizationAccountType): readonly GuideStep[] {
  if (!isIndividualAccount(accountType)) return FIRST_RUN_STEPS;
  return FIRST_RUN_STEPS.map((step, index) => {
    if (index === 0) return { ...step, detail: "You create your account; invite a spouse or an accountant from Users." };
    if (index === 4) return { ...step, title: journalName(accountType), detail: "Deliberate posts \u2014 never automatic from a Check." };
    return step;
  });
}

export function capabilityGroupsFor(accountType?: OrganizationAccountType): readonly CapabilityGroup[] {
  if (!isIndividualAccount(accountType)) return CAPABILITY_GROUPS;
  const [sources, journal, , reports, , people] = CAPABILITY_GROUPS;
  return [
    sources,
    { ...journal, title: journalName(accountType), items: ["Post entries", "Reverse with a note"] },
    { ...reports, title: "Reports", items: ["Trial balance & statements", "CSV / PDF export"] },
    { ...people, title: "History & people", items: ["Audit history", "Users & invites"] },
  ];
}

export function examplePromptsFor(accountType?: OrganizationAccountType): readonly ExamplePrompt[] {
  if (!isIndividualAccount(accountType)) return EXAMPLE_PROMPTS;
  const keep = new Set(["Getting started", "Reports", "Explain", "Ops"]);
  return [
    ...EXAMPLE_PROMPTS.filter((prompt) => keep.has(prompt.tone)),
    { tone: journalName(accountType), text: "Show my latest entries." },
  ];
}

export function refusalsFor(accountType?: OrganizationAccountType): readonly Refusal[] {
  if (!isIndividualAccount(accountType)) return REFUSALS;
  return REFUSALS.filter((item) => item.title !== "Bypass Approvals or period close").map((item) => {
    if (item.title === "Invent posted journals") return { ...item, title: "Invent posted entries" };
    if (item.title === "Cross entity or role walls") return { ...item, title: "Cross role walls", detail: "Your role always applies." };
    return item;
  });
}

/** The line under the Guide page title. */
export function guideDescriptionFor(accountType?: OrganizationAccountType): string {
  return isIndividualAccount(accountType)
    ? "Ask for reports, holdings, connections, and more \u2014 the assistant can do anything you can, under your role. Observations stay observed; entries stay deliberate."
    : "Ask for reports, matching, connections, and more \u2014 the assistant can do anything you can, under your role. Observations stay observed; journals stay deliberate.";
}

/** The path the restart-tour button reopens. */
export function tourPathFor(accountType?: OrganizationAccountType): string {
  return isIndividualAccount(accountType)
    ? "Connect \u2192 Check \u2192 Balances \u2192 " + journalName(accountType) + " \u2192 Reports"
    : "Connect \u2192 Check \u2192 Balances \u2192 Match \u2192 Journal \u2192 Reports";
}
