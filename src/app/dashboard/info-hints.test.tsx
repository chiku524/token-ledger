import type { ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequest, signInDemo, signInLive } from "@/test/server-harness";
import ApprovalsPage from "./approvals/page";
import AuditPage from "./audit/page";
import ConsolidationPage from "./consolidation/page";
import EntitiesPage from "./entities/page";
import GuidePage from "./guide/page";
import LedgerPage from "./ledger/page";
import OperationsPage from "./operations/page";
import OverviewPage from "./page";
import ReconciliationPage from "./reconciliation/page";
import ReportsPage from "./reports/page";
import SettingsPage from "./settings/page";
import SetupPage from "./setup/page";
import SourcesPage from "./sources/page";
import UsersPage from "./users/page";
import BillingPage from "./billing/page";
import TreasuryPage from "./treasury/page";
import PayablesPage from "./payables/page";
import { isLongDescription } from "@/components/app/info-hint-text";
import OnboardingPage from "./onboarding/page";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("next/server", async (importOriginal) => (await import("@/test/server-harness")).serverMock(importOriginal));
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/db/drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/drafts")>()),
  listOpenDrafts: vi.fn(async () => []),
}));
vi.mock("@/db/period-locks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/period-locks")>()),
  listPeriodLocks: vi.fn(async () => []),
}));
vi.mock("@/data/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/onboarding")>()),
  loadOnboardingHiddenTabs: vi.fn(async () => []),
}));

type Page = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>;


async function render(node: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(node, {
    onError: (error) => {
      throw error;
    },
  });
  let html = "";
  for await (const chunk of prelude) html += chunk;
  return html;
}

async function renderPage(page: Page, searchParams: Record<string, string> = {}): Promise<string> {
  return render(await page({ searchParams: Promise.resolve(searchParams) }));
}
beforeEach(() => resetRequest());
afterEach(() => vi.clearAllMocks());

const hintLabels = (html: string) => [...html.matchAll(/aria-label="About ([^"]+)"/g)].map((match) => match[1]);

/** A heading followed straight by a long description paragraph: it should be an info hint instead. */
const longDescriptionUnderHeading = (html: string) =>
  [...html.matchAll(/<\/h[12]>\s*(?:<\/div>)?\s*<p [^>]*>([^<]*)<\/p>/g)].map((match) => match[1]).filter(isLongDescription);

function expectHintsLinked(html: string) {
  for (const match of html.matchAll(/aria-label="About [^"]+"[^>]*aria-describedby="([^"]+)"/g)) {
    expect(html).toContain(`id="${match[1]}"`);
  }
}

describe("long section descriptions are info hints", () => {
  const organization: [string, Page, string[]][] = [
    ["billing", BillingPage as Page, ["Billing", "Your wallet", "Vaults and mandates"]],
    ["treasury", TreasuryPage as Page, ["Treasury", "Suppliers"]],
    ["payables", PayablesPage as Page, ["Payables", "Invoices", "Approval inbox"]],
    ["audit", AuditPage as Page, ["History"]],
    ["users", UsersPage as Page, ["Users"]],
    ["approvals", ApprovalsPage as Page, ["Approvals"]],
    ["entities", EntitiesPage as Page, ["Companies"]],
    ["guide", GuidePage as Page, ["Guide"]],
    ["setup", SetupPage as Page, ["Connect a wallet"]],
    ["onboarding", OnboardingPage as Page, ["Onboarding"]],
    ["operations", OperationsPage as Page, ["Operations", "How scheduled sync works"]],
    ["settings", SettingsPage as Page, ["Settings", "Track a wallet address"]],
    ["sources", SourcesPage as Page, ["Holdings", "Observed balances", "Connections", "Import activity"]],
    ["reports", ReportsPage as Page, ["Reports", "Financial statements", "Crypto held"]],
    ["reconciliation", ReconciliationPage as Page, ["Matching", "By place"]],
    ["consolidation", ConsolidationPage as Page, ["Add a rate"]],
    ["ledger", LedgerPage as Page, ["Post an entry"]],
    ["overview", OverviewPage as Page, ["Balance Sheet and Profit &amp; Loss", "Entries"]],
  ];

  it.each(organization)("organization %s", { timeout: 60000 }, async (_name, page, expected) => {
    signInDemo("owner");
    const html = await renderPage(page);
    for (const label of expected) expect(hintLabels(html)).toContain(label);
    expect(longDescriptionUnderHeading(html)).toEqual([]);
    expectHintsLinked(html);
  });

  const individual: [string, Page, string[]][] = [
    ["settings", SettingsPage as Page, ["Settings", "Track a wallet address"]],
    ["sources", SourcesPage as Page, ["Holdings", "Connections", "Import activity"]],
    ["setup", SetupPage as Page, ["Connect your accounts"]],
    ["guide", GuidePage as Page, ["Guide"]],
    ["audit", AuditPage as Page, ["History"]],
    ["users", UsersPage as Page, ["Users"]],
    ["overview", OverviewPage as Page, ["Gain / loss"]],
  ];

  it.each(individual)("individual %s", { timeout: 60000 }, async (_name, page, expected) => {
    signInLive("owner", { accountType: "individual" });
    const html = await renderPage(page);
    for (const label of expected) expect(hintLabels(html).some((found) => found.startsWith(label))).toBe(true);
    expect(longDescriptionUnderHeading(html)).toEqual([]);
    expectHintsLinked(html);
  });
});