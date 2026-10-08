import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth/current";
import { getSession } from "@/auth/current";
import { loadOnboardingHiddenTabs } from "@/data/onboarding";
import { RedirectSignal } from "@/test/server-harness";
import { requireSectionAccess } from "./section-access";

vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("@/auth/current", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/current")>()),
  getSession: vi.fn(async () => null),
}));
vi.mock("@/data/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/onboarding")>()),
  loadOnboardingHiddenTabs: vi.fn(async () => []),
}));

function session(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: "user_1",
    organizationId: "org_1",
    email: "a@b.test",
    name: "A",
    role: "onboarding",
    platformAdmin: false,
    entityScope: [],
    demo: false,
    connectionTourCompletedAt: null,
    emailVerified: true,
    ...overrides,
  };
}

async function redirectOf(run: Promise<void>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(loadOnboardingHiddenTabs).mockResolvedValue([]);
});

describe("requireSectionAccess", () => {
  it("lets a non-onboarding role through regardless of hidden tabs", async () => {
    vi.mocked(getSession).mockResolvedValue(session({ role: "viewer" }));
    vi.mocked(loadOnboardingHiddenTabs).mockResolvedValue(["/dashboard/ledger"]);
    expect(await redirectOf(requireSectionAccess("/dashboard/ledger"))).toBeNull();
  });

  it("sends an onboarding user home from a hidden section", async () => {
    vi.mocked(getSession).mockResolvedValue(session({ role: "onboarding" }));
    vi.mocked(loadOnboardingHiddenTabs).mockResolvedValue(["/dashboard/ledger"]);
    expect(await redirectOf(requireSectionAccess("/dashboard/ledger"))).toBe("/dashboard");
  });

  it("lets an onboarding user into a section that is not hidden", async () => {
    vi.mocked(getSession).mockResolvedValue(session({ role: "onboarding" }));
    vi.mocked(loadOnboardingHiddenTabs).mockResolvedValue(["/dashboard/ledger"]);
    expect(await redirectOf(requireSectionAccess("/dashboard/audit"))).toBeNull();
  });

  it("never blocks Overview or Settings", async () => {
    vi.mocked(getSession).mockResolvedValue(session({ role: "onboarding" }));
    vi.mocked(loadOnboardingHiddenTabs).mockResolvedValue(["/dashboard", "/dashboard/settings"]);
    expect(await redirectOf(requireSectionAccess("/dashboard"))).toBeNull();
    expect(await redirectOf(requireSectionAccess("/dashboard/settings"))).toBeNull();
  });

  it("does nothing without a session or in demo mode", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(await redirectOf(requireSectionAccess("/dashboard/ledger"))).toBeNull();

    vi.mocked(getSession).mockResolvedValue(session({ role: "onboarding", demo: true }));
    expect(await redirectOf(requireSectionAccess("/dashboard/ledger"))).toBeNull();
  });
});
