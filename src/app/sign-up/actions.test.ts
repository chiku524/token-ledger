import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COOKIE, SESSION_COOKIE } from "@/auth/cookies";
import { verifyPassword } from "@/auth/password";
import { WATCH_CHAIN_LABELS } from "@/data/connections";
import { createEmailVerification, createSession, findUserByEmail } from "@/db/auth-store";
import { registerOrganization } from "@/db/register";
import { BooksWriteError } from "@/db/write";
import { deliver } from "@/email/links";
import { accountUser, cookieJar, CROSS_SITE, form, FORM_EXPIRED, redirectOf, resetRequest } from "@/test/server-harness";
import { signUpAction } from "./actions";

vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);
vi.mock("@/db/auth-store", async () => (await import("@/test/server-harness")).authStoreMock());
vi.mock("@/db/register", () => ({
  registerOrganization: vi.fn(async () => ({ userId: "user_signup", organizationId: "org_signup" })),
}));
vi.mock("@/email/links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/email/links")>()),
  deliver: vi.fn(async () => ({ sent: true, provider: "test" })),
}));

const PASSWORD = "Harbourline-owner-1";
const SIGNUP = {
  name: "Amina Rahman",
  email: "amina@harbourline.example",
  password: PASSWORD,
  confirm: PASSWORD,
  organizationName: "Harbourline Digital",
  entityName: "Harbourline Digital Sdn. Bhd.",
  jurisdiction: "my",
  functionalCurrency: "MYR",
  reportingFramework: "MFRS",
};
const WALLET = {
  walletEnabled: "on",
  walletName: "Treasury",
  walletChain: "ethereum",
  walletRole: "cold",
  walletIdentifier: "0x0000000000000000000000000000000000000001",
};
const EXCHANGE = { exchangeEnabled: "on", exchangeName: "Kraken desk", exchangeIdentifier: "kraken-main", exchangeVenue: "kraken" };

beforeEach(() => {
  resetRequest();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-that-is-at-least-32-chars");
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signUp(fields: Record<string, string>, options?: { csrf?: string | null }) {
  return redirectOf(signUpAction(form(fields, options)));
}

describe("signUpAction", () => {
  it("creates the organization, signs the owner in, and sends a confirmation email", async () => {
    const result = await signUp(SIGNUP);
    expect(result.pathname).toBe("/dashboard/settings");
    expect(result.params.get("saved")).toBe("Account created. You can connect a wallet, an exchange, or a custodian from Settings.");
    const input = vi.mocked(registerOrganization).mock.calls[0]![0];
    expect(input).toMatchObject({
      ownerName: "Amina Rahman",
      email: "amina@harbourline.example",
      organizationName: "Harbourline Digital",
      entityName: "Harbourline Digital Sdn. Bhd.",
      jurisdiction: "MY",
      functionalCurrency: "MYR",
      reportingFramework: "MFRS",
      connections: [],
    });
    expect(await verifyPassword(PASSWORD, input.passwordHash)).toBe(true);
    expect(createSession).toHaveBeenCalledWith("user_signup");
    expect(cookieJar.set).toHaveBeenCalledWith(SESSION_COOKIE, "new-session-token", expect.objectContaining({ httpOnly: true }));
    expect(cookieJar.delete).toHaveBeenCalledWith(DEMO_COOKIE);
    expect(createEmailVerification).toHaveBeenCalledWith("user_signup", "org_signup");
    const message = vi.mocked(deliver).mock.calls[0]![0];
    expect(message.to).toBe("amina@harbourline.example");
    expect(message.text).toContain("https://ledger.test/verify-email?token=verify-token");
  });

  it("counts one read-only connection", async () => {
    const result = await signUp({ ...SIGNUP, ...WALLET });
    expect(result.params.get("saved")).toBe("Account created with 1 read-only connection. Permissions stay at balances and movements.");
    expect(vi.mocked(registerOrganization).mock.calls[0]![0].connections).toHaveLength(1);
  });

  it("counts several read-only connections", async () => {
    const result = await signUp({ ...SIGNUP, ...WALLET, ...EXCHANGE });
    expect(result.params.get("saved")).toBe("Account created with 2 read-only connections. Permissions stay at balances and movements.");
  });

  it("still succeeds when the confirmation email is not sent", async () => {
    vi.mocked(deliver).mockResolvedValue({ sent: false, reason: "No provider.", provider: "none" });
    const result = await signUp(SIGNUP);
    expect(result.pathname).toBe("/dashboard/settings");
  });

  // Known bug: the "best-effort" email step sits in the same try as registration,
  // so a failure there reports "could not be created" after the account and session exist.
  it.fails("does not report failure when only the confirmation token cannot be stored", async () => {
    vi.mocked(createEmailVerification).mockRejectedValue(new Error("connection reset"));
    const result = await signUp(SIGNUP);
    expect(result.pathname).toBe("/dashboard/settings");
  });

  it("refuses an email that already has an account", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(accountUser("owner", { email: "amina@harbourline.example" }));
    const result = await signUp(SIGNUP);
    expect(result.pathname).toBe("/sign-up");
    expect(result.params.get("error")).toBe("That email already has an account. Sign in instead.");
    expect(registerOrganization).not.toHaveBeenCalled();
  });

  it.each([
    [{ confirm: "different-password-1" }, "The passwords do not match."],
    [{ jurisdiction: "Malaysia" }, "Country code must be two letters, such as MY or SG."],
    [{ walletEnabled: "on", walletName: "W", walletChain: "dogecoin", walletRole: "hot", walletIdentifier: "x" }, `Choose a supported chain: ${WATCH_CHAIN_LABELS}.`],
  ])("explains a form problem %o", async (fields, message) => {
    const result = await signUp({ ...SIGNUP, ...fields });
    expect(result.pathname).toBe("/sign-up");
    expect(result.params.get("error")).toBe(message);
    expect(registerOrganization).not.toHaveBeenCalled();
  });

  it("shows a write error from registration", async () => {
    vi.mocked(registerOrganization).mockRejectedValue(new BooksWriteError("That organization name is taken."));
    const result = await signUp(SIGNUP);
    expect(result.params.get("error")).toBe("That organization name is taken.");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("hides any other registration failure", async () => {
    vi.mocked(registerOrganization).mockRejectedValue(new Error("duplicate key value violates unique constraint users_email"));
    const result = await signUp(SIGNUP);
    expect(result.params.get("error")).toBe("The account could not be created.");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it.each([
    ["DATABASE_URL", "DATABASE_URL", ""],
    ["AUTH_SECRET", "AUTH_SECRET", "too-short"],
  ])("needs %s", async (_label, name, value) => {
    vi.stubEnv(name, value);
    const result = await signUp(SIGNUP);
    expect(result.params.get("error")).toBe("Creating an account needs DATABASE_URL and AUTH_SECRET.");
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses a stale CSRF token", async () => {
    const result = await signUp(SIGNUP, { csrf: "stale" });
    expect(result.pathname).toBe("/sign-up");
    expect(result.params.get("error")).toBe(FORM_EXPIRED);
    expect(registerOrganization).not.toHaveBeenCalled();
  });

  it("refuses a cross-site origin", async () => {
    resetRequest({ origin: "https://evil.example" });
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    const result = await signUp(SIGNUP);
    expect(result.params.get("error")).toBe(CROSS_SITE);
  });
});
