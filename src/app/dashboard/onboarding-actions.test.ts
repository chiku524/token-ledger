import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOnboardingHiddenTabs } from "@/data/onboarding";
import {
  CROSS_SITE,
  expectError,
  expectSaved,
  form,
  FORM_EXPIRED,
  NO_PERMISSION,
  resetRequest,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import { saveOnboardingTabsAction } from "./onboarding-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/client", async () => (await import("@/test/server-harness")).dbClientMock);
vi.mock("@/data/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/onboarding")>()),
  saveOnboardingHiddenTabs: vi.fn(async () => undefined),
}));

const PATH = "/dashboard/onboarding";
const READ_ONLY = "Connect a database to change onboarding access. This demo does not save it.";

function tabs(hidden: string[]): FormData {
  const data = form({});
  for (const href of hidden) data.append("hidden", href);
  return data;
}

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("saveOnboardingTabsAction", () => {
  it("saves the hidden tabs an owner chose", async () => {
    signInLive("owner");
    await expectSaved(
      saveOnboardingTabsAction(tabs(["/dashboard/ledger", "/dashboard/audit"])),
      PATH,
      "Updated 2 hidden tabs.",
    );
    expect(saveOnboardingHiddenTabs).toHaveBeenCalledWith(expect.any(String), ["/dashboard/ledger", "/dashboard/audit"]);
  });

  it("lets an admin change the selection too", async () => {
    signInLive("admin");
    await expectSaved(saveOnboardingTabsAction(tabs(["/dashboard/reports"])), PATH, "Updated 1 hidden tab.");
  });

  it("drops hrefs that are not hideable", async () => {
    signInLive("owner");
    await expectSaved(
      saveOnboardingTabsAction(tabs(["/dashboard/ledger", "/dashboard", "/dashboard/settings", "/nonsense"])),
      PATH,
      "Updated 1 hidden tab.",
    );
    expect(saveOnboardingHiddenTabs).toHaveBeenCalledWith(expect.any(String), ["/dashboard/ledger"]);
  });

  it("clears the selection when nothing is ticked", async () => {
    signInLive("owner");
    await expectSaved(saveOnboardingTabsAction(tabs([])), PATH, "The onboarding role now sees every tab.");
    expect(saveOnboardingHiddenTabs).toHaveBeenCalledWith(expect.any(String), []);
  });

  it.each(["accountant", "approver", "viewer", "onboarding"] as const)("refuses a %s", async (role) => {
    signInLive(role);
    await expectError(saveOnboardingTabsAction(tabs(["/dashboard/ledger"])), PATH, NO_PERMISSION);
    expect(saveOnboardingHiddenTabs).not.toHaveBeenCalled();
  });

  it("is read-only for a demo session", async () => {
    signInDemo("owner");
    await expectError(saveOnboardingTabsAction(tabs(["/dashboard/ledger"])), PATH, READ_ONLY);
  });

  it("rejects a missing CSRF token", async () => {
    signInLive("owner");
    const data = tabs(["/dashboard/ledger"]);
    data.set("csrf", "stale");
    await expectError(saveOnboardingTabsAction(data), PATH, FORM_EXPIRED);
  });

  it("rejects a cross-site request", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("owner");
    await expectError(saveOnboardingTabsAction(tabs(["/dashboard/ledger"])), PATH, CROSS_SITE);
  });
});
