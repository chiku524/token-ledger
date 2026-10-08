import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequest, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/availability", () => ({ hasDatabase: () => true }));
vi.mock("@/db/platform", () => ({
  platformTotals: vi.fn(async () => ({ organizations: 1, users: 2 })),
  listPlatformOrgs: vi.fn(async () => [
    { id: "org_1", name: "Org One", origin: "live", createdAt: "2026-01-01T00:00:00Z", userCount: 2, entityCount: 1, ownerEmails: ["owner@example.com"], lastActivityAt: null },
  ]),
  listPlatformUsers: vi.fn(async () => [
    { id: "u1", organizationId: "org_1", organizationName: "Org One", email: "owner@example.com", name: "Owner", role: "owner", status: "active", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", lastSignedInAt: null },
  ]),
}));

import PlatformPage from "./page";

beforeEach(() => resetRequest());
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("platform page", () => {
  it("redirects a signed-in non-platform-admin home", async () => {
    signInLive("owner", { email: "orgadmin@harbourline.example" });
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "boss@harbourline.example");
    await expect(PlatformPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("renders the cross-organization view for a platform admin", async () => {
    signInLive("owner", { email: "boss@harbourline.example", name: "Boss" });
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "boss@harbourline.example");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(await PlatformPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Platform");
    expect(html).toContain("Org One");
    expect(html).toContain("owner@example.com");
    expect(html).toContain("All users (1)");
  });
});
