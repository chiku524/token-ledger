import type { ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bannedTermsIn, ENTRY_WORDING_PATTERN, visibleText } from "@/test/banned-terms";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { resetRequest, signInDemo, signInLive } from "@/test/server-harness";
import GuidePage from "./guide/page";
import LedgerPage from "./ledger/page";
import OverviewPage from "./page";
import ReportsPage from "./reports/page";
import SetupPage from "./setup/page";
import SourcesPage from "./sources/page";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("next/server", async (importOriginal) => (await import("@/test/server-harness")).serverMock(importOriginal));
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/test/individual-books")).individualBooks),
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

async function renderHtml(page: Page, searchParams: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerenderToNodeStream(await page({ searchParams: Promise.resolve(searchParams) }), {
    onError: (error) => {
      throw error;
    },
  });
  let html = "";
  for await (const chunk of prelude) html += chunk;
  return html;
}

const individual = () => signInLive("owner", { accountType: "individual" });

beforeEach(() => resetRequest());
afterEach(() => vi.resetAllMocks());

describe("an individual's report and activity pages", () => {
  it.each<[string, Page, Record<string, string>]>([
    ["Overview", OverviewPage as Page, {}],
    ["Activity", LedgerPage as Page, {}],
    ["Reports: Portfolio summary", ReportsPage as Page, {}],
    ["Reports: Portfolio summary tab", ReportsPage as Page, { tab: "portfolio" }],
    ["Reports: Activity history", ReportsPage as Page, { tab: "activity" }],
    ["Reports: Value over time", ReportsPage as Page, { tab: "value" }],
  ])("%s has no accounting terminology", async (_name, page, searchParams) => {
    individual();
    const words = visibleText(await renderHtml(page, searchParams));
    expect(words.length).toBeGreaterThan(50);
    expect(bannedTermsIn(words)).toEqual([]);
    expect(words).not.toMatch(ENTRY_WORDING_PATTERN);
    expect(hiddenSectionsIn(words)).toEqual([]);
  });

  it("names the three reports and the downloads in plain words", async () => {
    individual();
    const words = visibleText(await renderHtml(ReportsPage as Page));
    for (const name of ["Portfolio summary", "Activity history", "Value over time"]) expect(words).toContain(name);
    expect(words).toMatch(/CSV/);
    expect(words).toMatch(/PDF/);
    expect(words).not.toMatch(/Trial balance|Balance sheet|Income statement/i);
  });

  it("offers only the plain export kinds", async () => {
    individual();
    const html = await renderHtml(ReportsPage as Page, { tab: "activity" });
    const kinds = [...html.matchAll(/export\?kind=([a-z-]+)/g)].map((match) => match[1]);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(["pdf", "portfolio", "activity", "value-over-time"]).toContain(kind);
  });
});

describe("an individual's Activity page", () => {
  it("is a read-only view of transactions and balance changes", async () => {
    individual();
    const html = await renderHtml(LedgerPage as Page);
    const words = visibleText(html);
    expect(words).toContain("Activity");
    expect(words).toContain("Download CSV");
    expect(words).not.toMatch(/Post an entry|Reverse|Prepare|Import activity|Add a line|Save entry/i);
    expect(html).not.toContain("<textarea");
    expect(html).not.toMatch(/name="line0_/);
    expect(html).not.toMatch(/<form[^>]*method="post"/i);
  });

  it("still gives an organization the journal, with its entry form", async () => {
    signInDemo("accountant");
    const words = visibleText(await renderHtml(LedgerPage as Page));
    expect(words).toContain("Journal");
    expect(words).toContain("Post an entry");
  });
});

describe("an individual's Overview, Holdings, Guide and Setup", () => {
  it.each<[string, Page]>([
    ["Overview", OverviewPage as Page],
    ["Holdings", SourcesPage as Page],
    ["Guide", GuidePage as Page],
    ["Setup", SetupPage as Page],
  ])("%s has no journal, posted or unposted wording", async (_name, page) => {
    individual();
    const words = visibleText(await renderHtml(page));
    expect(words).not.toMatch(ENTRY_WORDING_PATTERN);
    expect(words).not.toMatch(/unposted|not booked|booked value/i);
  });

  it("points the Overview at Holdings, Activity and Reports, with no entries", async () => {
    individual();
    const html = await renderHtml(OverviewPage as Page);
    for (const path of ["/dashboard/sources#observed-balances", "/dashboard/ledger", "/dashboard/reports"]) expect(html).toContain(`href="${path}"`);
    const words = visibleText(html);
    expect(words).toContain("Portfolio value");
    expect(words).not.toMatch(/Recent entries|Unposted|Post an entry/i);
  });

  it("keeps accounting-system exports off Holdings for an individual", async () => {
    individual();
    const words = visibleText(await renderHtml(SourcesPage as Page));
    expect(words).not.toMatch(/Xero|QuickBooks|Accounting export/);
    expect(words).toContain("Kraken");
  });

  it("still lists accounting-system exports for an organization", async () => {
    signInDemo("accountant");
    expect(visibleText(await renderHtml(SourcesPage as Page))).toContain("Xero");
  });
});
