import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequest, signInDemo, signInLive } from "@/test/server-harness";
import { individualBooks as exampleBooks } from "@/test/individual-books";
import { bannedTermsIn } from "@/test/banned-terms";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => exampleBooks),
}));

import { GET } from "./route";

function exportRequest(kind: string | null): Request {
  const query = kind === null ? "" : `?kind=${kind}`;
  return new Request(`https://ledger.test/dashboard/reports/export${query}`);
}

beforeEach(() => resetRequest());
afterEach(() => vi.clearAllMocks());

describe("GET /dashboard/reports/export by account type", () => {
  it("still needs a session", async () => {
    expect((await GET(exportRequest("journal"))).status).toBe(401);
  });

  it("keeps the reconciliation export for an organization", async () => {
    signInLive("owner");
    const response = await GET(exportRequest("reconciliation"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("csv");
  });

  it.each(["portfolio", "activity", "value-over-time"])("lets an individual download the %s export as plain CSV", async (kind) => {
    signInLive("owner", { accountType: "individual" });
    const response = await GET(exportRequest(kind));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("csv");
    expect(response.headers.get("content-disposition") ?? "").not.toMatch(/trial|journal|ledger|reconcil/i);
    expect(bannedTermsIn(await response.text())).toEqual([]);
  });

  it.each(["trial-balance", "journal", "general-ledger"])("answers an individual's %s export the way it answers a page that does not exist", async (kind) => {
    signInLive("owner", { accountType: "individual" });
    expect((await GET(exportRequest(kind))).status).toBe(404);
  });

  it("lets an individual download the PDF", async () => {
    signInLive("owner", { accountType: "individual" });
    expect((await GET(exportRequest("pdf"))).status).not.toBe(404);
  });

  it("answers an individual's reconciliation export the way it answers a page that does not exist", async () => {
    signInLive("owner", { accountType: "individual" });
    const response = await GET(exportRequest("reconciliation"));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/csv|exception|unmatched/i);
  });

  it.each(["not-a-kind", null])("does not let an individual reach the unknown-kind branch for %s", async (kind) => {
    signInLive("owner", { accountType: "individual" });
    expect((await GET(exportRequest(kind))).status).toBe(404);
  });

  it("still tells an organization about an unknown kind", async () => {
    signInDemo("owner");
    expect((await GET(exportRequest("not-a-kind"))).status).toBe(400);
  });
});
