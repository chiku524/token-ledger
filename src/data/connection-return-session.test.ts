import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRequest, signInDemo, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

import { connectionReturnPathForSession } from "./connection-return-session";

beforeEach(() => resetRequest());
afterEach(() => vi.clearAllMocks());

describe("connectionReturnPathForSession", () => {
  it("returns an organization to Operations", async () => {
    signInLive("owner");
    expect(await connectionReturnPathForSession("/dashboard/operations")).toBe("/dashboard/operations");
  });

  it("returns an individual to Settings instead of Operations, and keeps its other paths", async () => {
    signInLive("owner", { accountType: "individual" });
    expect(await connectionReturnPathForSession("/dashboard/operations")).toBe("/dashboard/settings");
    expect(await connectionReturnPathForSession("/dashboard/setup?step=exchange")).toBe("/dashboard/setup?step=exchange");
  });

  it("falls back to Settings for an unknown path or no session", async () => {
    signInDemo("owner");
    expect(await connectionReturnPathForSession("https://example.com")).toBe("/dashboard/settings");
    resetRequest();
    expect(await connectionReturnPathForSession("/dashboard/operations")).toBe("/dashboard/operations");
  });
});
