import { describe, expect, it } from "vitest";
import { csrfMatches, originAllowed, safeNextPath } from "./csrf";
import { sessionCookieOptions } from "./cookies";
import { demoSessionFromCookie, demoSignInAllowed, readDemoToken, signDemoToken } from "./demo";
import { hashToken, sealToken } from "./tokens";
import { lockoutRemaining } from "./lockout";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { can, canAccessEntity, canAssignRole, canDeactivate, PERMISSIONS, removesLastOwner, ROLES } from "./roles";

describe("password hashing", () => {
  it("hashes with PBKDF2 and rejects a different password", async () => {
    const stored = await hashPassword("Harbourline-owner-1");
    expect(stored.startsWith("pbkdf2$")).toBe(true);
    // Workerd (Cloudflare Workers) refuses PBKDF2 above 100,000 iterations, so
    // the hash must stay at or below that to run on both Node and Workers.
    const iterations = Number(stored.split("$")[2]);
    expect(iterations).toBeLessThanOrEqual(100_000);
    expect(await verifyPassword("Harbourline-owner-1", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
    expect(await verifyPassword("Harbourline-owner-1", "not-a-hash")).toBe(false);
    expect(needsRehash(stored)).toBe(false);
  });

  it("still verifies a legacy scrypt hash and flags it for re-hash", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.from("0123456789abcdef");
    const hash = scryptSync("Harbourline-owner-1", salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const stored = `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
    expect(await verifyPassword("Harbourline-owner-1", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
    expect(needsRehash(stored)).toBe(true);
  });
});

describe("permission matrix", () => {
  it("gives every role a consistent set of permissions", () => {
    for (const role of ROLES) {
      expect(can(role, "books.read")).toBe(true);
      expect(can(role, "books.export")).toBe(true);
      expect(can(role, "audit.read")).toBe(true);
    }
    expect(can("viewer", "journal.post")).toBe(false);
    expect(can("viewer", "users.manage")).toBe(false);
    expect(can("accountant", "journal.post")).toBe(true);
    expect(can("accountant", "journal.reverse")).toBe(true);
    expect(can("accountant", "source.import")).toBe(true);
    expect(can("accountant", "entity.write")).toBe(false);
    expect(can("accountant", "fx.write")).toBe(false);
    // An approver approves but never posts directly, and cannot manage users.
    expect(can("approver", "journal.approve")).toBe(true);
    expect(can("approver", "journal.post")).toBe(false);
    expect(can("approver", "journal.reverse")).toBe(false);
    expect(can("approver", "users.manage")).toBe(false);
    expect(can("accountant", "journal.approve")).toBe(false);
    expect(can("accountant", "reconciliation.match")).toBe(true);
    expect(can("viewer", "reconciliation.match")).toBe(false);
    expect(can("admin", "users.manage")).toBe(true);
    expect(can("admin", "entity.write")).toBe(true);
    expect(can("admin", "fx.write")).toBe(true);
    expect(can("admin", "users.manageOwners")).toBe(false);
    expect(can("owner", "users.manageOwners")).toBe(true);
    for (const permission of PERMISSIONS) {
      expect(can("owner", permission)).toBe(true);
    }
  });

  it("stops an admin from assigning or removing an owner, and scopes viewers to entities", () => {
    const admin = { id: "admin", role: "admin" as const, entityScope: [] };
    const owner = { id: "owner", role: "owner" as const, entityScope: [] };
    expect(canAssignRole(admin, "accountant", null)).toBe(true);
    expect(canAssignRole(admin, "owner", null)).toBe(false);
    expect(canAssignRole(admin, "viewer", { id: "owner", role: "owner" })).toBe(false);
    expect(canAssignRole(owner, "admin", { id: "admin", role: "admin" })).toBe(true);
    expect(canAssignRole(admin, "viewer", { id: "admin", role: "admin" })).toBe(false);
    expect(canDeactivate(admin, { id: "owner", role: "owner" })).toBe(false);
    expect(canDeactivate(owner, { id: "admin", role: "admin" })).toBe(true);
    expect(canDeactivate(owner, { id: "owner", role: "owner" })).toBe(false);
    expect(removesLastOwner(["owner"], "owner", "admin")).toBe(true);
    expect(removesLastOwner(["owner", "owner-2"], "owner", "inactive")).toBe(false);

    const viewer = { id: "v", role: "viewer" as const, entityScope: ["ent_harbourline_sg"] };
    expect(canAccessEntity(viewer, "ent_harbourline_sg")).toBe(true);
    expect(canAccessEntity(viewer, "ent_harbourline_my")).toBe(false);
    expect(canAccessEntity({ ...viewer, entityScope: [] }, "ent_harbourline_my")).toBe(true);
    expect(canAccessEntity(admin, "ent_harbourline_my")).toBe(true);
  });
});

describe("demo sign-in", () => {
  it("is allowed only without a database and outside production", () => {
    expect(demoSignInAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(demoSignInAllowed({ NODE_ENV: "development", DATABASE_URL: "postgres://localhost/token_ledger" })).toBe(false);
    expect(demoSignInAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(demoSignInAllowed({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
    expect(demoSignInAllowed({ NODE_ENV: "production", DATABASE_URL: "postgres://localhost/books" })).toBe(false);
  });

  it("rejects a tampered or expired demo token", () => {
    const token = signDemoToken({
      role: "viewer",
      name: "David Ong",
      email: "viewer@harbourline.example",
      entityScope: [],
      exp: Date.now() + 60_000,
    });
    expect(readDemoToken(token)?.role).toBe("viewer");
    expect(readDemoToken(`${token}x`)).toBeNull();
    const expired = signDemoToken({
      role: "owner",
      name: "Amina",
      email: "owner@harbourline.example",
      entityScope: [],
      exp: Date.now() - 1,
    });
    expect(readDemoToken(expired)).toBeNull();
    const minted = signDemoToken({
      role: "owner",
      name: "Amina Rahman",
      email: "owner@harbourline.example",
      entityScope: [],
      exp: Date.now() + 60_000,
    });
    expect(demoSessionFromCookie(minted, { NODE_ENV: "production" })).toBeNull();
    expect(demoSessionFromCookie(minted, { NODE_ENV: "development", DATABASE_URL: "postgres://localhost/books" })).toBeNull();
    expect(demoSessionFromCookie(minted, { NODE_ENV: "development" })?.email).toBe("owner@harbourline.example");
  });
});

describe("session tokens", () => {
  it("seals a bearer token with the auth secret", () => {
    const token = "example-bearer-token";
    expect(sealToken(token, "a".repeat(32))).toBe(sealToken(token, "a".repeat(32)));
    expect(sealToken(token, "a".repeat(32))).not.toBe(sealToken(token, "b".repeat(32)));
    expect(sealToken(token, "a".repeat(32))).not.toBe(hashToken(token));
  });
});

describe("sign-in lockout and request guards", () => {
  it("locks the fifth failure inside the window", () => {
    const now = new Date("2026-06-30T12:00:00.000Z");
    const failures = [1, 2, 3, 4].map((minute) => new Date(now.getTime() - minute * 60_000));
    expect(lockoutRemaining(failures, now)).toBe(0);
    failures.push(new Date(now.getTime() - 30_000));
    expect(lockoutRemaining(failures, now)).toBeGreaterThan(0);
  });

  it("requires a matching origin and a same-site cookie", () => {
    expect(originAllowed("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(originAllowed("https://evil.example", "localhost:3000")).toBe(false);
    expect(originAllowed(null, "localhost:3000")).toBe(false);
    expect(csrfMatches("abc", "abc")).toBe(true);
    expect(csrfMatches("abc", "abd")).toBe(false);
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("/dashboard/ledger")).toBe("/dashboard/ledger");
    const cookie = sessionCookieOptions(true);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.secure).toBe(true);
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
