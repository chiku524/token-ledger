/** Sections for the in-app Guide / AI chatbot capability handbook. */

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
