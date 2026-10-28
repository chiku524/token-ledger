import type { ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepInOwnArea } from "@/auth/account-home";
import { safeNextPath } from "@/auth/csrf";
import { REQUEST_PATH_HEADER } from "@/data/me-paths";
import { connectionReturnPath } from "@/data/connection-return";
import { scrubHiddenSectionLinks } from "@/ai/hidden-sections";
import { individualBooks } from "@/test/individual-books";
import { redirectOf, resetRequest, setHeader, signInLive } from "@/test/server-harness";
import OverviewPage from "./page";
import SourcesPage from "./sources/page";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("next/server", async (importOriginal) => (await import("@/test/server-harness")).serverMock(importOriginal));
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

let current: typeof individualBooks = individualBooks;
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

async function render(page: Page, searchParams: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerenderToNodeStream(await page({ searchParams: Promise.resolve(searchParams) }), {
    onError: (error) => {
      throw error;
    },
  });
  let html = "";
  for await (const chunk of prelude) html += chunk;
  return html;
}

beforeEach(() => resetRequest());
afterEach(() => vi.clearAllMocks());

describe("keepInOwnArea", () => {
  it("sends an individual from a dashboard address to the same page under /me, query kept", async () => {
    setHeader(REQUEST_PATH_HEADER, "/dashboard/sources?currency=SGD");
    expect((await redirectOf(keepInOwnArea("individual"))).pathname).toBe("/me/holdings");
    setHeader(REQUEST_PATH_HEADER, "/dashboard/audit?action=wallet.bound");
    const history = await redirectOf(keepInOwnArea("individual"));
    expect(history.pathname).toBe("/me/history");
    expect(history.params.get("action")).toBe("wallet.bound");
    setHeader(REQUEST_PATH_HEADER, "/dashboard");
    expect((await redirectOf(keepInOwnArea("individual"))).pathname).toBe("/me");
  });

  it("sends an organization from /me back to the dashboard", async () => {
    setHeader(REQUEST_PATH_HEADER, "/me/holdings");
    expect((await redirectOf(keepInOwnArea("organization"))).pathname).toBe("/dashboard/sources");
    setHeader(REQUEST_PATH_HEADER, "/me/activity");
    expect((await redirectOf(keepInOwnArea(undefined))).pathname).toBe("/dashboard/ledger");
  });

  it("leaves a request in its own area, or outside both, alone", async () => {
    setHeader(REQUEST_PATH_HEADER, "/me/holdings");
    await expect(keepInOwnArea("individual")).resolves.toBeUndefined();
    setHeader(REQUEST_PATH_HEADER, "/dashboard/sources");
    await expect(keepInOwnArea("organization")).resolves.toBeUndefined();
    setHeader(REQUEST_PATH_HEADER, "/api/connect/exchange/callback?code=1");
    await expect(keepInOwnArea("individual")).resolves.toBeUndefined();
  });

  it("does nothing when the proxy recorded no address", async () => {
    await expect(keepInOwnArea("individual")).resolves.toBeUndefined();
  });
});

describe("pages behind /me", () => {
  const individual = () => {
    current = { ...individualBooks, organization: { ...individualBooks.organization, accountType: "individual" } };
    return signInLive("owner", { accountType: "individual" });
  };

  it("render for an individual who asked for the /me address", async () => {
    individual();
    setHeader(REQUEST_PATH_HEADER, "/me/holdings");
    expect(await render(SourcesPage as Page)).toContain("Holdings");
  });

  it("send an individual who asked for the dashboard address on to /me", async () => {
    individual();
    setHeader(REQUEST_PATH_HEADER, "/dashboard");
    expect((await redirectOf(render(OverviewPage as Page))).pathname).toBe("/me");
    setHeader(REQUEST_PATH_HEADER, "/dashboard/sources");
    expect((await redirectOf(render(SourcesPage as Page))).pathname).toBe("/me/holdings");
  });

  it("send an organization that asked for /me back to the dashboard", async () => {
    current = individualBooks;
    signInLive("owner");
    setHeader(REQUEST_PATH_HEADER, "/me/holdings");
    expect((await redirectOf(render(SourcesPage as Page))).pathname).toBe("/dashboard/sources");
  });
});

describe("where a sign-in or a form may send the person", () => {
  it("allows /me addresses as the sign-in destination, and nothing outside the app", () => {
    expect(safeNextPath("/me/holdings?currency=SGD")).toBe("/me/holdings?currency=SGD");
    expect(safeNextPath("/me")).toBe("/me");
    expect(safeNextPath("/dashboard/reports")).toBe("/dashboard/reports");
    for (const value of ["/memo", "//evil.test", "https://evil.test/me", "/me\\x", "", null]) expect(safeNextPath(value)).toBe("/dashboard");
  });

  it("reads a connection return by either address and answers with the dashboard one", () => {
    expect(connectionReturnPath("/me/setup?step=exchange", "individual")).toBe("/dashboard/setup?step=exchange");
    expect(connectionReturnPath("/me/holdings?currency=MYR", "individual")).toBe("/dashboard/sources?currency=MYR");
    expect(connectionReturnPath("/me/operations", "individual")).toBe("/dashboard/settings");
    expect(connectionReturnPath("/me/anything", "individual")).toBe("/dashboard/settings");
  });
});

describe("the assistant's stored links", () => {
  it("are scrubbed for a section an individual does not have, at either address", () => {
    const placeholder = "a page that is not part of this account";
    expect(scrubHiddenSectionLinks("Open /me/matching and /me/reconciliation?tab=1 today.", "individual")).toBe(`Open ${placeholder} and ${placeholder} today.`);
    expect(scrubHiddenSectionLinks("See [Companies](https://ledger.test/me/entities).", "individual")).toBe(`See ${placeholder}.`);
  });

  it("keep the links an individual does have, and text that only looks like /me", () => {
    for (const text of ["Open /me/holdings or /me/activity.", "Your notes are in /home/me/matching.", "See /memo/entities."]) {
      expect(scrubHiddenSectionLinks(text, "individual")).toBe(text);
    }
    expect(scrubHiddenSectionLinks("Open /me/matching.", "organization")).toBe("Open /me/matching.");
  });
});
