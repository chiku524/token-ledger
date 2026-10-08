import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { form, redirectOf, resetRequest, accountUser, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

const store = vi.hoisted(() => ({ target: null as Record<string, unknown> | null, statusCalls: [] as unknown[], adminCalls: [] as unknown[] }));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (store.target ? [store.target] : []) }) }) }),
  }),
}));
vi.mock("@/db/platform", () => ({
  setPlatformUserStatus: vi.fn(async (id: string, status: string) => {
    store.statusCalls.push({ id, status });
  }),
  setPlatformUserAdmin: vi.fn(async (id: string, platformAdmin: boolean) => {
    store.adminCalls.push({ id, platformAdmin });
  }),
}));

import { deactivatePlatformUserAction, reactivatePlatformUserAction, grantPlatformAdminAction, revokePlatformAdminAction } from "./platform-actions";

beforeEach(() => {
  resetRequest();
  store.target = { id: "user_target", organizationId: "org_other", email: "them@example.com", status: "active" };
  store.statusCalls = [];
  store.adminCalls = [];
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "boss@harbourline.example");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function signInPlatformAdmin() {
  signInLive("owner", { id: "user_boss", email: "boss@harbourline.example", name: "Boss" });
}

describe("platform user status actions", () => {
  it("deactivates another user's account for a platform admin", async () => {
    signInPlatformAdmin();
    const redirect = await redirectOf(deactivatePlatformUserAction(form({ userId: "user_target" })));
    expect(redirect.pathname).toBe("/dashboard/platform");
    expect(redirect.params.get("saved")).toMatch(/deactivated/i);
    expect(store.statusCalls).toEqual([{ id: "user_target", status: "inactive" }]);
  });

  it("reactivates a user", async () => {
    signInPlatformAdmin();
    await redirectOf(reactivatePlatformUserAction(form({ userId: "user_target" })));
    expect(store.statusCalls).toEqual([{ id: "user_target", status: "active" }]);
  });

  it("refuses a non-platform-admin even with an org owner role", async () => {
    signInLive("owner", { email: "orgadmin@harbourline.example" });
    const redirect = await redirectOf(deactivatePlatformUserAction(form({ userId: "user_target" })));
    // Redirected home by requirePlatformAdmin, not to the platform panel.
    expect(redirect.pathname).toBe("/dashboard");
    expect(store.statusCalls).toEqual([]);
  });

  it("refuses to change the admin's own status", async () => {
    signInPlatformAdmin();
    const redirect = await redirectOf(deactivatePlatformUserAction(form({ userId: "user_boss" })));
    expect(redirect.params.get("error")).toMatch(/your own status/i);
    expect(store.statusCalls).toEqual([]);
  });

  it("reports a user that no longer exists", async () => {
    signInPlatformAdmin();
    store.target = null;
    const redirect = await redirectOf(deactivatePlatformUserAction(form({ userId: "gone" })));
    expect(redirect.params.get("error")).toMatch(/no longer exists/i);
  });

  it("grants the platform-admin role to another user", async () => {
    signInPlatformAdmin();
    const redirect = await redirectOf(grantPlatformAdminAction(form({ userId: "user_target" })));
    expect(redirect.params.get("saved")).toMatch(/granted/i);
    expect(store.adminCalls).toEqual([{ id: "user_target", platformAdmin: true }]);
  });

  it("revokes another user's platform-admin role", async () => {
    signInPlatformAdmin();
    await redirectOf(revokePlatformAdminAction(form({ userId: "user_target" })));
    expect(store.adminCalls).toEqual([{ id: "user_target", platformAdmin: false }]);
  });

  it("refuses to revoke the acting admin's own platform access", async () => {
    signInPlatformAdmin();
    const redirect = await redirectOf(revokePlatformAdminAction(form({ userId: "user_boss" })));
    expect(redirect.params.get("error")).toMatch(/revoke your own/i);
    expect(store.adminCalls).toEqual([]);
  });
});

void accountUser;
