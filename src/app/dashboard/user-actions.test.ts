import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COOKIE } from "@/auth/cookies";
import { readDemoToken } from "@/auth/demo";
import {
  activeOwnerIds,
  createEmailVerification,
  createInvite,
  deactivateUser,
  deleteUserSessions,
  findUserByEmail,
  insertUser,
  listOrganizationUsers,
  setUserAccess,
  updateUserName,
  writeAudit,
} from "@/db/auth-store";
import { deliver } from "@/email/links";
import {
  accountUser,
  actorOf,
  cookieJar,
  CROSS_SITE,
  expectError,
  expectSaved,
  form,
  FORM_EXPIRED,
  MY,
  NO_PERMISSION,
  ORG,
  redirectOf,
  resetRequest,
  revalidatePath,
  setHeader,
  SG,
  signInDemo,
  signInLive,
} from "@/test/server-harness";
import {
  changeAccessAction,
  changeNameAction,
  deactivateUserAction,
  inviteUserAction,
  resendVerificationAction,
} from "./user-actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/data/load-books", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/load-books")>()),
  loadBooks: vi.fn(async () => (await import("@/data/example-books")).exampleBooks),
}));
vi.mock("@/email/links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/email/links")>()),
  deliver: vi.fn(async () => ({ sent: true, provider: "test" })),
}));

const USERS = "/dashboard/users";
const SETTINGS = "/dashboard/settings";
const READ_ONLY = "Connect a database to add people. This demo does not save them.";
const INVITE = { name: "Nadia", email: " nadia@example.com ", role: "accountant", entityScope: "" };

beforeEach(() => {
  resetRequest();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each([
  ["inviteUserAction", inviteUserAction, INVITE],
  ["changeAccessAction", changeAccessAction, { userId: "user_viewer", role: "accountant" }],
  ["deactivateUserAction", deactivateUserAction, { userId: "user_viewer" }],
] as const)("%s guards", (_name, action, fields) => {
  it.each(["accountant", "approver", "viewer"] as const)("refuses a %s", async (role) => {
    signInLive(role);
    await expectError(action(form(fields)), USERS, NO_PERMISSION);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("is read-only for a demo admin with no database", async () => {
    signInDemo("admin");
    await expectError(action(form(fields)), USERS, READ_ONLY);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("owner");
    await expectError(action(form(fields, { csrf: "stale" })), USERS, FORM_EXPIRED);
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("owner");
    await expectError(action(form(fields)), USERS, CROSS_SITE);
  });

  it("sends a signed-out visitor to sign in", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    expect((await redirectOf(action(form(fields)))).pathname).toBe("/sign-in");
  });
});

describe("inviteUserAction", () => {
  it("creates the invited user, emails the link, audits, and shows the token", async () => {
    const admin = signInLive("admin");
    const result = await redirectOf(inviteUserAction(form({ ...INVITE, entityScope: `${MY}, ${SG}` })));
    expect(result.pathname).toBe(USERS);
    expect(result.params.get("issued")).toBe("invite-token");
    expect(result.params.get("emailed")).toBe("1");
    expect(insertUser).toHaveBeenCalledWith({
      organizationId: ORG,
      email: "nadia@example.com",
      name: "Nadia",
      role: "accountant",
      entityScope: [MY, SG],
      passwordHash: null,
      status: "invited",
    });
    expect(createInvite).toHaveBeenCalledWith({
      organizationId: ORG,
      email: "nadia@example.com",
      role: "accountant",
      entityScope: [MY, SG],
      createdBy: admin.id,
    });
    const message = vi.mocked(deliver).mock.calls[0]![0];
    expect(message.to).toBe("nadia@example.com");
    expect(message.text).toContain("https://ledger.test/sign-in?invite=invite-token");
    expect(message.text).toContain("Harbourline Digital");
    expect(writeAudit).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: actorOf(admin),
      action: "user.invited",
      subjectType: "user",
      subjectId: "user_new",
      detail: "Invited nadia@example.com as accountant; invite emailed.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("still issues the token when the email is not sent", async () => {
    signInLive("owner");
    vi.mocked(deliver).mockResolvedValue({ sent: false, reason: "No email provider is configured.", provider: "none" });
    const result = await redirectOf(inviteUserAction(form(INVITE)));
    expect(result.params.get("issued")).toBe("invite-token");
    expect(result.params.has("emailed")).toBe(false);
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({
      action: "user.invite_created",
      detail: "Invited nadia@example.com as accountant; email not sent (No email provider is configured.).",
    });
  });

  it("builds the link from forwarded headers", async () => {
    resetRequest({ origin: "https://app.example", host: "internal:3000" });
    setHeader("x-forwarded-host", "app.example");
    setHeader("x-forwarded-proto", "http");
    signInLive("owner");
    await redirectOf(inviteUserAction(form(INVITE)));
    expect(vi.mocked(deliver).mock.calls[0]![0].text).toContain("http://app.example/sign-in?invite=invite-token");
  });

  it("prefers APP_URL for the link", async () => {
    signInLive("owner");
    vi.stubEnv("APP_URL", "https://ledger.example.com/");
    await redirectOf(inviteUserAction(form(INVITE)));
    expect(vi.mocked(deliver).mock.calls[0]![0].text).toContain("https://ledger.example.com/sign-in?invite=invite-token");
  });

  it("stops an admin from inviting an owner", async () => {
    signInLive("admin");
    await expectError(inviteUserAction(form({ ...INVITE, role: "owner" })), USERS, "You cannot assign that role.");
    expect(insertUser).not.toHaveBeenCalled();
  });

  it("lets an owner invite an owner", async () => {
    signInLive("owner");
    const result = await redirectOf(inviteUserAction(form({ ...INVITE, role: "owner" })));
    expect(result.params.get("issued")).toBe("invite-token");
  });

  it("refuses an unknown company in the scope", async () => {
    signInLive("owner");
    await expectError(inviteUserAction(form({ ...INVITE, entityScope: `${MY},ent_other` })), USERS, "Unknown company ent_other.");
  });

  it("refuses an email already in the organization", async () => {
    signInLive("owner");
    vi.mocked(findUserByEmail).mockResolvedValue(accountUser("viewer", { email: "nadia@example.com" }));
    await expectError(inviteUserAction(form(INVITE)), USERS, "That email is already in this organization.");
    expect(insertUser).not.toHaveBeenCalled();
  });

  it("returns the first validation issue", async () => {
    signInLive("owner");
    await expectError(inviteUserAction(form({ ...INVITE, email: "not-an-email" })), USERS, "Enter an email address.");
  });

  it("maps a database failure to a safe message and sends nothing", async () => {
    signInLive("owner");
    vi.mocked(insertUser).mockRejectedValue({ code: "23505" });
    await expectError(inviteUserAction(form(INVITE)), USERS, "That reference or address is already in use.");
    expect(deliver).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });
});

describe("changeAccessAction", () => {
  const viewer = accountUser("viewer");
  const otherOwner = accountUser("owner", { id: "user_owner_2", email: "owner2@harbourline.example" });

  it("changes the role and scope, signs the user out, and audits", async () => {
    const owner = signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([owner, viewer]);
    vi.mocked(activeOwnerIds).mockResolvedValue([owner.id]);
    await expectSaved(
      changeAccessAction(form({ userId: viewer.id, role: "accountant", entityScope: ` ${SG} ,` })),
      USERS,
      `Updated ${viewer.email}.`,
    );
    expect(setUserAccess).toHaveBeenCalledWith(viewer.id, "accountant", [SG]);
    expect(deleteUserSessions).toHaveBeenCalledWith(viewer.id);
    expect(writeAudit).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: actorOf(owner),
      action: "user.role_changed",
      subjectType: "user",
      subjectId: viewer.id,
      detail: `${viewer.email} is now accountant.`,
    });
  });

  it("keeps the session when a user narrows their own scope", async () => {
    const owner = signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([owner]);
    vi.mocked(activeOwnerIds).mockResolvedValue([owner.id]);
    await expectSaved(changeAccessAction(form({ userId: owner.id, role: "owner", entityScope: MY })), USERS, `Updated ${owner.email}.`);
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("refuses a change to the user's own role", async () => {
    const admin = signInLive("admin");
    vi.mocked(listOrganizationUsers).mockResolvedValue([admin]);
    await expectError(changeAccessAction(form({ userId: admin.id, role: "viewer" })), USERS, "You cannot change that user's role.");
    expect(setUserAccess).not.toHaveBeenCalled();
  });

  it("stops an admin from changing an owner", async () => {
    signInLive("admin");
    vi.mocked(listOrganizationUsers).mockResolvedValue([otherOwner]);
    await expectError(changeAccessAction(form({ userId: otherOwner.id, role: "viewer" })), USERS, "You cannot change that user's role.");
  });

  it("stops an admin from promoting to owner", async () => {
    signInLive("admin");
    vi.mocked(listOrganizationUsers).mockResolvedValue([viewer]);
    await expectError(changeAccessAction(form({ userId: viewer.id, role: "owner" })), USERS, "You cannot change that user's role.");
  });

  it("keeps at least one active owner", async () => {
    signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([otherOwner]);
    vi.mocked(activeOwnerIds).mockResolvedValue([otherOwner.id]);
    await expectError(
      changeAccessAction(form({ userId: otherOwner.id, role: "admin" })),
      USERS,
      "The organization needs at least one active owner.",
    );
    expect(setUserAccess).not.toHaveBeenCalled();
  });

  it("refuses an unknown role", async () => {
    signInLive("owner");
    await expectError(changeAccessAction(form({ userId: viewer.id, role: "superuser" })), USERS, "Choose a role.");
  });

  it("refuses an unknown company in the scope", async () => {
    signInLive("owner");
    await expectError(changeAccessAction(form({ userId: viewer.id, role: "viewer", entityScope: "ent_other" })), USERS, "Unknown company ent_other.");
  });

  it.each([
    ["a user from another organization", []],
    ["an inactive user", [accountUser("viewer", { status: "inactive" })]],
  ])("refuses %s", async (_label, users) => {
    signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue(users);
    await expectError(changeAccessAction(form({ userId: viewer.id, role: "accountant" })), USERS, "That user is not active in this organization.");
  });

  it("maps a database failure to a safe message", async () => {
    signInLive("owner");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listOrganizationUsers).mockResolvedValue([viewer]);
    vi.mocked(setUserAccess).mockRejectedValue(new Error("connection terminated"));
    await expectError(changeAccessAction(form({ userId: viewer.id, role: "accountant" })), USERS, "Could not save the record.");
    expect(writeAudit).not.toHaveBeenCalled();
  });
});

describe("deactivateUserAction", () => {
  const viewer = accountUser("viewer");
  const otherOwner = accountUser("owner", { id: "user_owner_2", email: "owner2@harbourline.example" });

  it("deactivates and audits", async () => {
    const admin = signInLive("admin");
    vi.mocked(listOrganizationUsers).mockResolvedValue([admin, viewer]);
    await expectSaved(deactivateUserAction(form({ userId: viewer.id })), USERS, `Deactivated ${viewer.email}.`);
    expect(deactivateUser).toHaveBeenCalledWith(viewer.id);
    expect(writeAudit).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: actorOf(admin),
      action: "user.deactivated",
      subjectType: "user",
      subjectId: viewer.id,
      detail: `Deactivated ${viewer.email}.`,
    });
  });

  it("refuses to deactivate yourself", async () => {
    const owner = signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([owner]);
    await expectError(deactivateUserAction(form({ userId: owner.id })), USERS, "You cannot deactivate that user.");
    expect(deactivateUser).not.toHaveBeenCalled();
  });

  it("stops an admin from deactivating an owner", async () => {
    signInLive("admin");
    vi.mocked(listOrganizationUsers).mockResolvedValue([otherOwner]);
    await expectError(deactivateUserAction(form({ userId: otherOwner.id })), USERS, "You cannot deactivate that user.");
  });

  it("keeps at least one active owner", async () => {
    signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([otherOwner]);
    vi.mocked(activeOwnerIds).mockResolvedValue([otherOwner.id]);
    await expectError(deactivateUserAction(form({ userId: otherOwner.id })), USERS, "The organization needs at least one active owner.");
  });

  it("refuses a user who is already inactive", async () => {
    signInLive("owner");
    vi.mocked(listOrganizationUsers).mockResolvedValue([accountUser("viewer", { status: "inactive" })]);
    await expectError(deactivateUserAction(form({ userId: viewer.id })), USERS, "That user is not active in this organization.");
  });

  it("maps a database failure to a safe message", async () => {
    signInLive("owner");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listOrganizationUsers).mockResolvedValue([viewer]);
    vi.mocked(deactivateUser).mockRejectedValue(new Error("deadlock detected"));
    await expectError(deactivateUserAction(form({ userId: viewer.id })), USERS, "Could not save the record.");
  });
});

describe("changeNameAction", () => {
  it("updates a live user's own name and audits with the new name", async () => {
    const user = signInLive("viewer");
    await expectSaved(changeNameAction(form({ name: "  Dee Ong  ", userId: "user_owner" })), SETTINGS, "Your name is updated.");
    expect(updateUserName).toHaveBeenCalledWith(user.id, "Dee Ong");
    expect(writeAudit).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: `Dee Ong <${user.email}>`,
      action: "user.name_changed",
      subjectType: "user",
      subjectId: user.id,
      detail: `Name changed from ${user.name} to Dee Ong.`,
    });
  });

  it("re-signs a demo cookie and saves nothing", async () => {
    const claims = signInDemo("accountant", [MY]);
    await expectSaved(changeNameAction(form({ name: "Renamed" })), SETTINGS, "Name updated for this demo session. It is not saved.");
    expect(updateUserName).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
    const token = vi.mocked(cookieJar.set).mock.calls.find(([name]) => name === DEMO_COOKIE)![1];
    expect(readDemoToken(token)).toMatchObject({ role: "accountant", name: "Renamed", email: claims.email, entityScope: [MY] });
  });

  it("returns the first validation issue", async () => {
    signInLive("viewer");
    await expectError(changeNameAction(form({ name: "   " })), SETTINGS, "Too small: expected string to have >=1 characters");
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("viewer");
    await expectError(changeNameAction(form({ name: "Dee" }, { csrf: "stale" })), SETTINGS, FORM_EXPIRED);
    expect(updateUserName).not.toHaveBeenCalled();
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    signInLive("viewer");
    await expectError(changeNameAction(form({ name: "Dee" })), SETTINGS, CROSS_SITE);
  });

  it("sends a signed-out visitor to sign in", async () => {
    expect((await redirectOf(changeNameAction(form({ name: "Dee" })))).pathname).toBe("/sign-in");
  });

  it("shows a safe message when the update fails, without auditing", async () => {
    signInLive("viewer");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(updateUserName).mockRejectedValue(new Error("timeout"));
    await expectError(changeNameAction(form({ name: "Dee" })), SETTINGS, "Could not save the record.");
    expect(writeAudit).not.toHaveBeenCalled();
  });
});

describe("resendVerificationAction", () => {
  it("emails the user's own address and audits", async () => {
    const user = signInLive("viewer", { emailVerifiedAt: null });
    await expectSaved(resendVerificationAction(form({})), SETTINGS, `Confirmation email sent to ${user.email}.`);
    expect(createEmailVerification).toHaveBeenCalledWith(user.id, ORG);
    const message = vi.mocked(deliver).mock.calls[0]![0];
    expect(message.to).toBe(user.email);
    expect(message.text).toContain("https://ledger.test/verify-email?token=verify-token");
    expect(vi.mocked(writeAudit).mock.calls[0]![0]).toMatchObject({ action: "user.verification_resent", detail: "Confirmation email resent." });
  });

  it("reports a delivery failure and audits it", async () => {
    signInLive("viewer");
    vi.mocked(deliver).mockResolvedValue({ sent: false, reason: "The provider rejected the message.", provider: "test" });
    await expectError(resendVerificationAction(form({})), SETTINGS, "The provider rejected the message.");
    expect(vi.mocked(writeAudit).mock.calls[0]![0].detail).toBe("Confirmation email not sent (The provider rejected the message.).");
  });

  it("falls back to a generic delivery message", async () => {
    signInLive("viewer");
    vi.mocked(deliver).mockResolvedValue({ sent: false, provider: "test" });
    await expectError(resendVerificationAction(form({})), SETTINGS, "The confirmation email could not be sent.");
  });

  it("is refused in the demo", async () => {
    signInDemo("owner");
    await expectError(
      resendVerificationAction(form({})),
      SETTINGS,
      "This sample is read-only. Verify a real account after connecting a database.",
    );
    expect(createEmailVerification).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token", async () => {
    signInLive("viewer");
    await expectError(resendVerificationAction(form({}, { csrf: "stale" })), SETTINGS, FORM_EXPIRED);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    expect((await redirectOf(resendVerificationAction(form({})))).pathname).toBe("/sign-in");
  });
});
