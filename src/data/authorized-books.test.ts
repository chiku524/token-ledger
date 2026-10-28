import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth/current";
import { booksForSession, canWriteBooks } from "./authorized-books";
import { exampleBooks } from "./example-books";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user_1",
    organizationId: "org_asset_manager_a",
    email: "owner@assetmanager-a.example",
    name: "Owner",
    role: "owner",
    accountType: "organization",
    platformAdmin: false,
    entityScope: [],
    demo: false,
    demoBooks: false,
    connectionTourCompletedAt: null,
    emailVerified: true,
    ...overrides,
  };
}

describe("booksForSession", () => {
  it("returns the example books when the demo-data switch is on", async () => {
    const books = await booksForSession(session({ demoBooks: true }));
    expect(books.organization.name).toBe(exampleBooks.organization.name);
    expect(books.organization.origin).toBe("example");
  });

  it("returns the example books for a demo session", async () => {
    const books = await booksForSession(session({ demo: true }));
    expect(books.organization.origin).toBe("example");
  });
});

describe("canWriteBooks", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("needs a database and a real session, and is off while demo data is on", () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    expect(canWriteBooks(session())).toBe(true);
    expect(canWriteBooks(session({ demo: true }))).toBe(false);
    expect(canWriteBooks(session({ demoBooks: true }))).toBe(false);
  });
});
