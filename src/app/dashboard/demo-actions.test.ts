import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_DATA_COOKIE } from "@/auth/cookies";
import {
  cookieJar,
  form,
  FORM_EXPIRED,
  redirectOf,
  resetRequest,
  revalidatePath,
  signInLive,
} from "@/test/server-harness";
import { setDemoDataAction } from "./demo-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("setDemoDataAction", () => {
  it("turns demo data on, revalidates, and redirects back to the page", async () => {
    signInLive("owner");
    const result = await redirectOf(setDemoDataAction(form({ enabled: "1", next: "/dashboard/sources" })));
    expect(result.pathname).toBe("/dashboard/sources");
    expect(cookieJar.set).toHaveBeenCalledWith(DEMO_DATA_COOKIE, "1", expect.objectContaining({ httpOnly: true }));
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("turns demo data off by clearing the cookie", async () => {
    signInLive("owner");
    const result = await redirectOf(setDemoDataAction(form({ enabled: "0", next: "/dashboard/ledger" })));
    expect(result.pathname).toBe("/dashboard/ledger");
    expect(cookieJar.delete).toHaveBeenCalledWith(DEMO_DATA_COOKIE);
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("redirects to the dashboard when the return path is not allowed", async () => {
    signInLive("owner");
    const result = await redirectOf(setDemoDataAction(form({ enabled: "1", next: "https://evil.example/" })));
    expect(result.pathname).toBe("/dashboard");
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("owner");
    await expect(setDemoDataAction(form({ enabled: "1", next: "/dashboard" }, { csrf: "stale" }))).rejects.toThrow(FORM_EXPIRED);
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    const result = await redirectOf(setDemoDataAction(form({ enabled: "1", next: "/dashboard" })));
    expect(result.pathname).toBe("/sign-in");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});
