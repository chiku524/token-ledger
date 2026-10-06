import type { ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import type { Role } from "@/auth/roles";
import { listOrganizationUsers } from "@/db/auth-store";
import { listOpenDrafts, type DraftRow } from "@/db/drafts";
import { listPeriodLocks } from "@/db/period-locks";
import { accountUser, MY, redirectOf, resetRequest, setCookie, SG, signInDemo, signInLive } from "@/test/server-harness";
import ApprovalsPage from "./approvals/page";
import AuditPage from "./audit/page";
import ConsolidationPage from "./consolidation/page";
import EntitiesPage from "./entities/page";
import GuidePage from "./guide/page";
import DashboardLayout from "./layout";
import LedgerPage from "./ledger/page";
import OperationsPage from "./operations/page";
import OverviewPage from "./page";
import ReconciliationPage from "./reconciliation/page";
import ReportsPage from "./reports/page";
import SettingsPage from "./settings/page";
import SetupPage from "./setup/page";
import SourcesPage from "./sources/page";
import UsersPage from "./users/page";

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

type Page = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>;

const DEMO_NOTE = "This demo does not save. Connect a database, then sign in with a password.";

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

function text(html: string): string {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function pageText(page: Page, searchParams: Record<string, string> = {}): Promise<string> {
  return text(await renderPage(page, searchParams));
}

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("read-only sample (demo owner, no database)", () => {
  it.each<[string, Page, string[]]>([
    ["Overview", OverviewPage as Page, ["Harbourline Digital", "Companies", "Recent entries"]],
    ["Journal", LedgerPage as Page, ["Journal", DEMO_NOTE, "Post an entry", "JE-2026-001"]],
    ["Reports", ReportsPage as Page, ["Reports", "Account balances and crypto values for one company."]],
    ["Matching", ReconciliationPage as Page, ["Matching", DEMO_NOTE]],
    ["Approvals", ApprovalsPage as Page, ["Approvals", DEMO_NOTE, "Nothing is waiting for approval."]],
    ["Holdings", SourcesPage as Page, ["Holdings", DEMO_NOTE, "Treasury hot wallet", "Import activity"]],
    ["Users", UsersPage as Page, ["Users", "Invite someone"]],
    ["Settings", SettingsPage as Page, ["Settings", "Your details"]],
    ["Companies", EntitiesPage as Page, ["Companies", DEMO_NOTE, "Add a company", "Harbourline Digital Sdn. Bhd."]],
    ["Combined", ConsolidationPage as Page, ["Combined", "Add a rate"]],
    ["History", AuditPage as Page, ["History"]],
    ["Operations", OperationsPage as Page, ["Operations", DEMO_NOTE]],
    ["Setup", SetupPage as Page, ["Step 1 of 3", DEMO_NOTE]],
    ["Guide", GuidePage as Page, ["Guide", "Where a connection sits"]],
  ])("renders %s from the sample books", async (_name, page, expected) => {
    signInDemo("owner");
    const content = await pageText(page);
    for (const phrase of expected) expect(content).toContain(phrase);
  });

  it("does not open the connect flow on Setup", async () => {
    signInDemo("owner");
    expect(await renderPage(SetupPage as Page)).not.toMatch(/>Connect<\/button>/);
  });
});

describe("role gating", () => {
  it.each<[Role, string]>([
    ["viewer", "You can view entries and download CSVs. Posting and corrections are hidden."],
    ["approver", "You can view entries and download CSVs. Posting and corrections are hidden."],
  ])("hides posting on Journal from a %s", async (role, note) => {
    signInDemo(role);
    const content = await pageText(LedgerPage as Page);
    expect(content).toContain(note);
    expect(content).not.toContain("Post an entry");
  });

  it("shows posting on Journal to an accountant", async () => {
    signInDemo("accountant");
    expect(await pageText(LedgerPage as Page)).toContain("Post an entry");
  });

  it("hides adding a company from an accountant", async () => {
    signInDemo("accountant");
    const content = await pageText(EntitiesPage as Page);
    expect(content).toContain("You can view companies. Adding one is for owners and admins.");
    expect(content).not.toContain("Add a company");
  });

  it("hides matching from a viewer", async () => {
    signInDemo("viewer");
    expect(await pageText(ReconciliationPage as Page)).toContain(
      "You can view matching. Clearing an exception or undoing a match is for an owner, admin, or accountant.",
    );
  });

  it("does not show a matcher the viewer note", async () => {
    signInDemo("accountant");
    expect(await pageText(ReconciliationPage as Page)).not.toContain("You can view matching.");
  });

  it("hides period close from the read-only sample", async () => {
    signInDemo("owner");
    expect(await pageText(ReconciliationPage as Page)).not.toContain("Period close");
  });

  it("hides imports and connection controls on Holdings from a viewer", async () => {
    signInDemo("viewer");
    const content = await pageText(SourcesPage as Page);
    expect(content).toContain("You can view holdings.");
    expect(content).not.toContain("Import activity");
  });

  it("hides the manual re-run on Operations from a viewer", async () => {
    signInDemo("viewer");
    expect(await pageText(OperationsPage as Page)).toContain("You can view connector health. A manual re-run is for an owner or an admin.");
  });

  it.each<Role>(["accountant", "viewer"])("hides adding a rate on Combined from a %s", async (role) => {
    signInDemo(role);
    expect(await pageText(ConsolidationPage as Page)).not.toContain("Add a rate");
  });

  it.each<Role>(["accountant", "approver", "viewer"])("refuses user management to a %s", async (role) => {
    signInDemo(role);
    const content = await pageText(UsersPage as Page);
    expect(content).toContain("You do not have permission to manage users.");
    expect(content).not.toContain("Invite someone");
  });

  it("tells a viewer approvals are not theirs", async () => {
    signInDemo("viewer");
    expect(await pageText(ApprovalsPage as Page)).toContain("Approval is for an owner, admin, accountant, or approver.");
  });

  it.each<Role>(["accountant", "approver", "viewer"])("sends a %s away from Setup", async (role) => {
    signInDemo(role);
    expect((await redirectOf(SetupPage({ searchParams: Promise.resolve({}) }))).url).toBe("/dashboard");
  });

  it("offers the tour again only to an admin who has dismissed it", async () => {
    signInDemo("admin");
    expect(await pageText(GuidePage as Page)).not.toContain("Take the tour");
    setCookie(CONNECTION_TOUR_COOKIE, "1");
    expect(await pageText(GuidePage as Page)).toContain("Take the tour");
    resetRequest();
    signInDemo("owner");
    setCookie(CONNECTION_TOUR_COOKIE, "1");
    expect(await pageText(GuidePage as Page)).not.toContain("Take the tour");
  });
});

describe("entity scope", () => {
  it("shows a scoped viewer only their company's entries", async () => {
    signInDemo("viewer", [SG]);
    const content = await pageText(LedgerPage as Page);
    expect(content).not.toContain("JE-2026-001");
    expect(content).toContain("Harbourline Digital Pte. Ltd.");
  });

  it("shows an unscoped viewer every company's entries", async () => {
    signInDemo("viewer");
    expect(await pageText(LedgerPage as Page)).toContain("JE-2026-001");
  });
});

describe("notices", () => {
  it("shows an error notice as an alert", async () => {
    signInDemo("owner");
    const html = await renderPage(LedgerPage as Page, { error: "That reference is already used." });
    expect(html).toMatch(/role="alert"[^>]*>[\s\S]*That reference is already used\./);
  });

  it("keeps a saved notice out of the markup, since it is a toast", async () => {
    signInDemo("owner");
    expect(await pageText(LedgerPage as Page, { saved: "Entry posted." })).not.toContain("Entry posted.");
  });

  it("explains an invalid date range", async () => {
    signInDemo("owner");
    const html = await renderPage(LedgerPage as Page, { from: "2026-06-30", to: "2026-04-01" });
    expect(html).toContain('role="alert"');
  });
});

describe("writable books (live owner, database configured)", () => {
  it.each<[string, Page, string]>([
    ["Journal", LedgerPage as Page, "Post an entry"],
    ["Companies", EntitiesPage as Page, "Add a company"],
    ["Combined", ConsolidationPage as Page, "Add a rate"],
  ])("shows the %s form without a read-only note", async (_name, page, form) => {
    signInLive("owner");
    const content = await pageText(page);
    expect(content).toContain(form);
    expect(content).not.toContain(DEMO_NOTE);
    expect(content).not.toContain("This sample is read-only.");
  });

  it("opens the connect flow on Setup", async () => {
    signInLive("admin");
    const html = await renderPage(SetupPage as Page, { step: "exchange" });
    expect(html).toMatch(/>Connect<\/button>/);
    expect(text(html)).not.toContain(DEMO_NOTE);
  });

  const drafts: DraftRow[] = [
    { id: "draft_a", entityId: MY, reference: "DR-1", entryDate: "2026-06-20", memo: "Draft", currency: "MYR", debitMinor: 100n, creditMinor: 100n, status: "draft", preparedBy: "a", postedEntryId: null },
    { id: "draft_b", entityId: MY, reference: "DR-2", entryDate: "2026-06-21", memo: "Pending", currency: "MYR", debitMinor: 200n, creditMinor: 200n, status: "pending", preparedBy: "a", postedEntryId: null },
  ];

  it("lets an owner approve with an override note", async () => {
    signInLive("owner");
    vi.mocked(listOpenDrafts).mockResolvedValue(drafts);
    const content = await pageText(ApprovalsPage as Page);
    expect(content).toContain("DR-1");
    expect(content).toContain("Submit for approval");
    expect(content).toContain("Approve and post");
    expect(await renderPage(ApprovalsPage as Page)).toContain("Owner override note (only if you prepared it)");
  });

  it("lets an approver approve without an override", async () => {
    signInLive("approver");
    vi.mocked(listOpenDrafts).mockResolvedValue(drafts);
    const html = await renderPage(ApprovalsPage as Page);
    expect(text(html)).toContain("Approve and post");
    expect(html).not.toContain("Owner override note");
  });

  it("shows an accountant that a pending entry waits for an approver", async () => {
    signInLive("accountant");
    vi.mocked(listOpenDrafts).mockResolvedValue(drafts);
    const content = await pageText(ApprovalsPage as Page);
    expect(content).toContain("Awaiting an approver");
    expect(content).not.toContain("Approve and post");
    expect(content).toContain("You can prepare and submit entries. Posting them is for an approver.");
  });

  it("lists closed periods and offers reopening to an owner only", async () => {
    vi.mocked(listPeriodLocks).mockResolvedValue([{ id: "lock_q1", entityId: MY, periodStart: "2026-01-01", periodEnd: "2026-03-31", note: "Q1 signed off" }]);
    signInLive("owner");
    const owner = await pageText(ReconciliationPage as Page);
    expect(owner).toContain("Q1 signed off");
    expect(owner).toContain("Reopen");
    expect(owner).toContain("Close a period");
    resetRequest();
    signInLive("accountant");
    vi.mocked(listPeriodLocks).mockResolvedValue([{ id: "lock_q1", entityId: MY, periodStart: "2026-01-01", periodEnd: "2026-03-31", note: "Q1 signed off" }]);
    const accountant = await pageText(ReconciliationPage as Page);
    expect(accountant).toContain("Q1 signed off");
    expect(accountant).not.toContain("Reopen");
    expect(accountant).not.toContain("Close a period");
  });

  it("lists the organization's people from the database", async () => {
    signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([accountUser("owner"), accountUser("viewer", { email: "dee@harbourline.example" })]);
    expect(await pageText(UsersPage as Page)).toContain("dee@harbourline.example");
  });
});

describe("dashboard layout", () => {
  async function layoutText(): Promise<string> {
    return text(await render(await DashboardLayout({ children: <p>page body</p> })));
  }

  it("labels a demo session and shows Users to an owner", async () => {
    signInDemo("owner");
    const content = await layoutText();
    expect(content).toContain("page body");
    expect(content).toContain("Demo");
    expect(content).toContain("Users");
  });

  it("hides Users from a viewer and shows who is signed in", async () => {
    signInDemo("viewer", [SG]);
    const content = await layoutText();
    expect(content).toContain("Demo viewer Viewer");
    expect(content).not.toMatch(/\bUsers\b/);
  });

  it("labels writable sample books for a live user", async () => {
    signInLive("viewer");
    expect(await layoutText()).toContain("Sample, saved");
  });
});
