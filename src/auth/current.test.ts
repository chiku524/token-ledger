import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_DATA_COOKIE } from "./cookies";
import { getSession } from "./current";
import { resetRequest, setCookie, signInDemo, signInLive } from "@/test/server-harness";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("getSession account type", () => {
  it("is an organization unless the user's organization says otherwise", async () => {
    signInLive("owner");
    expect((await getSession())?.accountType).toBe("organization");
  });

  it("carries an individual account through to the session", async () => {
    signInLive("owner", { accountType: "individual" });
    expect((await getSession())?.accountType).toBe("individual");
  });

  it("treats a demo session as an organization", async () => {
    signInDemo("owner");
    expect((await getSession())?.accountType).toBe("organization");
  });
});

describe("getSession with the demo-data cookie", () => {
  it("marks the session as demo books and clears the entity scope", async () => {
    signInLive("owner", { entityScope: ["ent_x"] });
    setCookie(DEMO_DATA_COOKIE, "1");
    const session = await getSession();
    expect(session?.demoBooks).toBe(true);
    expect(session?.entityScope).toEqual([]);
  });
});
