import type { ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/data/books";
import { defaultActivityRange } from "@/data/period";
import { individualBooks } from "@/test/individual-books";
import { bannedTermsIn, ENTRY_WORDING_PATTERN, visibleText } from "@/test/banned-terms";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { resetRequest, signInLive } from "@/test/server-harness";
import AuditPage from "./audit/page";
import { GET as auditExport } from "./audit/export/route";
import LedgerPage from "./ledger/page";
import ReportsPage from "./reports/page";
import SettingsPage from "./settings/page";
import SourcesPage from "./sources/page";

const event = (id: string, action: string, subjectType: string, detail: string, actor = "Sam"): AuditEvent => ({
  id,
  organizationId: individualBooks.organization.id,
  occurredAt: `2026-10-0${id}T10:00:00.000Z`,
  actor,
  action,
  subjectType,
  subjectId: `subject-${id}`,
  detail,
});

const books = {
  ...individualBooks,
  // A person has one entity: themselves.
  entities: individualBooks.entities.slice(0, 1),
  auditEvents: [
    event("1", "journal.posted", "journal_entry", "JE-0007 · Month-end sweep"),
    event("2", "connection.created", "connection", "Kraken read-only key added"),
    event("3", "wallet.bound", "source", "Hot wallet confirmed"),
    event("4", "period.closed", "period", "Closed 2026-Q3"),
    event("5", "auth.signed_in", "user", "Signed in"),
    event("6", "reconciliation.matched", "reconciliation", "Matched 4 lines"),
    event("7", "entity.created", "entity", "Sam (Personal) added"),
    event("8", "source_transactions.imported", "source", "Imported 3 rows"),
    event("9", "source_transactions.imported", "source", "Posted 3 rows to the journal"),
  ],
};

let current = books;

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("next/server", async (importOriginal) => (await import("@/test/server-harness")).serverMock(importOriginal));
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => current),
}));
vi.mock("@/db/drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/drafts")>()),
  listOpenDrafts: vi.fn(async () => []),
}));
vi.mock("@/db/period-locks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/period-locks")>()),
  listPeriodLocks: vi.fn(async () => []),
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

/** The value a date field on the rendered page opens with. */
function dateField(html: string, name: "from" | "to"): string | undefined {
  const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
  return input?.match(/value="([^"]*)"/)?.[1];
}

// The books an individual's own account loads carry their account type too.
const individual = () => {
  current = { ...books, organization: { ...books.organization, accountType: "individual" } };
  return signInLive("owner", { accountType: "individual" });
};
const organization = () => {
  current = books;
  return signInLive("owner");
};

beforeEach(() => resetRequest());
afterEach(() => vi.clearAllMocks());

describe("the date pickers an individual opens on", () => {
  const latest = defaultActivityRange(individualBooks);

  it("is a month ending on the newest activity, not January 1 to today", () => {
    expect(latest.from < latest.to).toBe(true);
    const days = (Date.parse(latest.to) - Date.parse(latest.from)) / 86_400_000 + 1;
    expect(days).toBe(30);
    expect(latest.to).not.toBe(`${new Date().getFullYear()}-01-01`);
  });

  it.each<[string, Page, Record<string, string>]>([
    ["Reports", ReportsPage as Page, {}],
    ["Reports, Activity history tab", ReportsPage as Page, { tab: "activity" }],
    ["Activity", LedgerPage as Page, {}],
  ])("%s starts on that month", async (_name, page, searchParams) => {
    individual();
    const html = await renderHtml(page, searchParams);
    expect(dateField(html, "from")).toBe(latest.from);
    expect(dateField(html, "to")).toBe(latest.to);
  });

  it.each<[string, Page]>([
    ["Reports", ReportsPage as Page],
    ["Activity", LedgerPage as Page],
  ])("%s keeps a range chosen in the address", async (_name, page) => {
    individual();
    const html = await renderHtml(page, { from: "2026-01-01", to: "2026-03-31" });
    expect(dateField(html, "from")).toBe("2026-01-01");
    expect(dateField(html, "to")).toBe("2026-03-31");
  });

  it("fills only the missing end from the default when the address gives one", async () => {
    individual();
    const html = await renderHtml(LedgerPage as Page, { from: latest.from });
    expect(dateField(html, "from")).toBe(latest.from);
    expect(dateField(html, "to")).toBe(latest.to);
  });

  it("goes back to the default when the address holds an invalid date", async () => {
    individual();
    const html = await renderHtml(ReportsPage as Page, { from: "2026-02-31", to: "2026-03-01" });
    expect(dateField(html, "from")).toBe(latest.from);
    expect(dateField(html, "to")).toBe(latest.to);
  });

  it("leaves an organization's Reports on its books period", async () => {
    organization();
    const html = await renderHtml(ReportsPage as Page);
    expect(dateField(html, "from")).toBe(individualBooks.period.start);
    expect(dateField(html, "to")).toBe(individualBooks.period.end);
  });
});

describe("an individual's History", () => {
  it("lists only their own events, in plain words", async () => {
    individual();
    const html = await renderHtml(AuditPage as Page);
    const words = visibleText(html);
    for (const shown of ["Connection added", "Wallet confirmed as yours", "Signed in", "Activity imported"]) {
      expect(words).toContain(shown);
    }
    expect(words).not.toMatch(/journal\.|period\.|reconciliation\.|entity\.|connection\.created|wallet\.bound/i);
    expect(words).not.toContain("Entry posted");
    expect(words).not.toContain("Company added");
    expect(words).not.toMatch(/JE-0007|Closed 2026-Q3|Matched 4 lines|Posted 3 rows/);
    expect(bannedTermsIn(words)).toEqual([]);
    expect(words).not.toMatch(ENTRY_WORDING_PATTERN);
    expect(hiddenSectionsIn(words)).toEqual([]);
  });

  it("does not suggest a journal action in the filter", async () => {
    individual();
    const html = await renderHtml(AuditPage as Page);
    expect(html).not.toContain("journal.posted");
  });

  it("still shows an organization every event, with its accounting wording", async () => {
    organization();
    const words = visibleText(await renderHtml(AuditPage as Page));
    expect(words).toContain("Entry posted");
    expect(words).toContain("Company added");
    expect(words).toContain("Posted 3 rows to the journal");
  });

  it("downloads only the same events, with plain labels", async () => {
    individual();
    const response = await auditExport(new Request("https://ledger.test/dashboard/audit/export"));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Connection added");
    expect(text).toContain("Wallet confirmed as yours");
    expect(text).not.toMatch(/journal|period\.|reconciliation|entity|Closed 2026-Q3/i);
  });

  it("downloads everything to an organization", async () => {
    organization();
    const text = await (await auditExport(new Request("https://ledger.test/dashboard/audit/export"))).text();
    expect(text).toContain("journal.posted");
    expect(text).toContain("period.closed");
  });
});


describe("the connections table on Settings and Holdings", () => {
  it.each<[string, Page]>([
    ["Settings", SettingsPage as Page],
    ["Holdings", SourcesPage as Page],
  ])("has no Company column for an individual on %s", async (_name, page) => {
    individual();
    const text = await renderHtml(page);
    expect(text).toContain("Last checked");
    expect(text).not.toMatch(/<th[^>]*>Company<\/th>/);
    expect(visibleText(text)).not.toMatch(/\bCompany\b/);

  });

  it("still sends the one entity with a new connection, without asking for it", async () => {
    individual();
    const text = await renderHtml(SettingsPage as Page);
    const entity = individualBooks.entities[0]!.id;
    expect(text).toContain(`<input type="hidden" name="entityId" value="${entity}"/>`);
  });

  it("asks an organization which company a new connection belongs to", async () => {
    organization();
    const text = await renderHtml(SettingsPage as Page);
    expect(text).toMatch(/<select[^>]*name="entityId"/);
  });

  it.each<[string, Page]>([
    ["Settings", SettingsPage as Page],
    ["Holdings", SourcesPage as Page],
  ])("keeps the Company column for an organization on %s", async (_name, page) => {
    organization();
    expect(await renderHtml(page)).toMatch(/<th[^>]*>Company<\/th>/);
  });
});
