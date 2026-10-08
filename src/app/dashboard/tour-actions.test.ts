import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTION_TOUR_COOKIE } from "@/auth/cookies";
import { AuthError } from "@/auth/current";
import { completeConnectionTour, reopenConnectionTour, writeAudit } from "@/db/auth-store";
import {
  actorOf,
  cookieJar,
  form,
  FORM_EXPIRED,
  ORG,
  redirectOf,
  resetRequest,
  revalidatePath,
  setCookie,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import { completeConnectionTourAction, reopenConnectionTourAction } from "./tour-actions";

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

describe("completeConnectionTourAction", () => {
  it("records a live admin's first completion and audits it", async () => {
    const admin = signInLive("admin");
    await completeConnectionTourAction(form({}));
    expect(completeConnectionTour).toHaveBeenCalledWith(admin.id);
    expect(writeAudit).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: actorOf(admin),
      action: "connection.tour_completed",
      subjectType: "user",
      subjectId: admin.id,
      detail: "Finished the connection tour.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("does not record a second completion", async () => {
    signInLive("admin", { connectionTourCompletedAt: new Date("2026-09-01T00:00:00.000Z") });
    await completeConnectionTourAction(form({}));
    expect(completeConnectionTour).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("remembers a demo admin's completion in a cookie only", async () => {
    signInDemo("admin");
    await completeConnectionTourAction(form({}));
    expect(cookieJar.set).toHaveBeenCalledWith(CONNECTION_TOUR_COOKIE, "1", expect.objectContaining({ httpOnly: true, maxAge: 60 * 60 * 24 * 365 }));
    expect(completeConnectionTour).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it.each(["owner", "accountant", "approver", "viewer"] as const)("does nothing for a %s", async (role) => {
    signInLive(role);
    await completeConnectionTourAction(form({}));
    expect(completeConnectionTour).not.toHaveBeenCalled();
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a stale CSRF token", async () => {
    signInLive("admin");
    await expect(completeConnectionTourAction(form({}, { csrf: "stale" }))).rejects.toThrow(new AuthError(FORM_EXPIRED));
    expect(completeConnectionTour).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    expect((await redirectOf(completeConnectionTourAction(form({})))).pathname).toBe("/sign-in");
  });
});

describe("reopenConnectionTourAction", () => {
  it("reopens a live admin's tour, audits, and goes to Sources", async () => {
    const admin = signInLive("admin", { connectionTourCompletedAt: new Date("2026-09-01T00:00:00.000Z") });
    const result = await redirectOf(reopenConnectionTourAction(form({})));
    expect(result.pathname).toBe("/dashboard/sources");
    expect(reopenConnectionTour).toHaveBeenCalledWith(admin.id);
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "connection.tour_reopened", subjectId: admin.id });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("clears a demo admin's cookie only", async () => {
    signInDemo("admin");
    setCookie(CONNECTION_TOUR_COOKIE, "1");
    const result = await redirectOf(reopenConnectionTourAction(form({})));
    expect(result.pathname).toBe("/dashboard/sources");
    expect(cookieJar.delete).toHaveBeenCalledWith(CONNECTION_TOUR_COOKIE);
    expect(reopenConnectionTour).not.toHaveBeenCalled();
  });

  it.each(["owner", "accountant", "approver", "viewer"] as const)("does nothing for a %s", async (role) => {
    signInLive(role);
    await expect(reopenConnectionTourAction(form({}))).resolves.toBeUndefined();
    expect(reopenConnectionTour).not.toHaveBeenCalled();
  });

  it("rejects a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("admin");
    await expect(reopenConnectionTourAction(form({}))).rejects.toThrow(new AuthError("Cross-site request blocked."));
    expect(reopenConnectionTour).not.toHaveBeenCalled();
  });
});
