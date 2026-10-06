import { and, eq, gt, inArray } from "drizzle-orm";
import type { Role } from "@/auth/roles";
import { isRole } from "@/auth/roles";
import { authSecretConfigured, readAuthSecret } from "@/env";
import { newSecretToken, sealToken } from "@/auth/tokens";
import { getDb } from "./client";
import { auditEvents, emailVerifications, invites, passwordResets, sessions, signInAttempts, users } from "./schema";

export interface AccountUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "invited" | "inactive";
  entityScope: string[];
  passwordHash: string | null;
  connectionTourCompletedAt: Date | null;
  emailVerifiedAt: Date | null;
}

const SESSION_MS = 12 * 60 * 60 * 1000;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

export async function findUserByEmail(email: string): Promise<AccountUser | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function listOrganizationUsers(organizationId: string): Promise<AccountUser[]> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.organizationId, organizationId)).orderBy(users.email);
  return rows.map(mapUser);
}

export async function activeOwnerIds(organizationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.role, "owner"), eq(users.status, "active")));
  return rows.map((row) => row.id);
}

export async function recentFailedAttempts(email: string, since: Date): Promise<Date[]> {
  const db = getDb();
  const rows = await db
    .select({ attemptedAt: signInAttempts.attemptedAt })
    .from(signInAttempts)
    .where(and(eq(signInAttempts.email, email.toLowerCase()), eq(signInAttempts.succeeded, false), gt(signInAttempts.attemptedAt, since)));
  return rows.map((row) => row.attemptedAt);
}

export async function recordSignInAttempt(email: string, succeeded: boolean): Promise<void> {
  const db = getDb();
  await db.insert(signInAttempts).values({
    id: newId("attempt"),
    email: email.toLowerCase(),
    succeeded,
    attemptedAt: new Date(),
  });
}

export async function createSession(userId: string): Promise<string> {
  const token = newSecretToken();
  const db = getDb();
  await db.insert(sessions).values({
    id: sealToken(token, readAuthSecret()),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  if (!authSecretConfigured()) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sealToken(token, readAuthSecret())));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function userForSessionToken(token: string): Promise<AccountUser | null> {
  if (!authSecretConfigured()) return null;
  const db = getDb();
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sealToken(token, readAuthSecret())))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now() || row.user.status !== "active") return null;
  return mapUser(row.user);
}

export async function insertUser(input: {
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  entityScope: string[];
  passwordHash: string | null;
  status: "active" | "invited" | "inactive";
}): Promise<string> {
  const id = newId("user");
  const db = getDb();
  await db.insert(users).values({
    id,
    organizationId: input.organizationId,
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    status: input.status,
    entityScope: input.entityScope.join(","),
    passwordHash: input.passwordHash,
    connectionTourCompletedAt: null,
  });
  return id;
}

export async function createInvite(input: {
  organizationId: string;
  email: string;
  role: Role;
  entityScope: string[];
  createdBy: string;
}): Promise<string> {
  const token = newSecretToken();
  const db = getDb();
  await db.insert(invites).values({
    id: newId("invite"),
    organizationId: input.organizationId,
    email: input.email.toLowerCase(),
    role: input.role,
    entityScope: input.entityScope.join(","),
    tokenHash: sealToken(token, readAuthSecret()),
    expiresAt: new Date(Date.now() + INVITE_MS),
    createdBy: input.createdBy,
  });
  return token;
}

export async function findInvite(token: string) {
  if (!authSecretConfigured()) return null;
  const db = getDb();
  const rows = await db.select().from(invites).where(eq(invites.tokenHash, sealToken(token, readAuthSecret()))).limit(1);
  const invite = rows[0];
  if (!invite || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

export async function consumeInvite(token: string, passwordHash: string): Promise<AccountUser | null> {
  const invite = await findInvite(token);
  if (!invite) return null;
  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, invite.organizationId), eq(users.email, invite.email)))
    .limit(1);
  const current = existing[0];
  if (!current) return null;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, status: "active", role: invite.role, entityScope: invite.entityScope })
      .where(eq(users.id, current.id));
    await tx.delete(invites).where(eq(invites.id, invite.id));
  });
  return mapUser({ ...current, passwordHash, status: "active", role: invite.role, entityScope: invite.entityScope });
}

const RESET_MS = 60 * 60 * 1000;
const VERIFY_MS = 7 * 24 * 60 * 60 * 1000;

/** Create a reset token for a user. Replaces any existing one. Returns the token. */
export async function createPasswordReset(userId: string, organizationId: string): Promise<string> {
  const token = newSecretToken();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    await tx.insert(passwordResets).values({
      id: newId("reset"),
      organizationId,
      userId,
      tokenHash: sealToken(token, readAuthSecret()),
      expiresAt: new Date(Date.now() + RESET_MS),
    });
  });
  return token;
}

/** Set a new password from a reset token and invalidate the user's sessions. */
export async function consumePasswordReset(token: string, passwordHash: string): Promise<AccountUser | null> {
  if (!authSecretConfigured()) return null;
  const db = getDb();
  const rows = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, sealToken(token, readAuthSecret()))).limit(1);
  const reset = rows[0];
  if (!reset || reset.expiresAt.getTime() < Date.now()) return null;
  const userRows = await db.select().from(users).where(eq(users.id, reset.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== "active") return null;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, reset.userId));
  });
  return mapUser({ ...user, passwordHash });
}

/** Create a verification token for a user. Replaces any existing one. */
export async function createEmailVerification(userId: string, organizationId: string): Promise<string> {
  const token = newSecretToken();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
    await tx.insert(emailVerifications).values({
      id: newId("verify"),
      organizationId,
      userId,
      tokenHash: sealToken(token, readAuthSecret()),
      expiresAt: new Date(Date.now() + VERIFY_MS),
    });
  });
  return token;
}

/** Mark a user's email verified from a token. Returns the user, or null. */
export async function consumeEmailVerification(token: string): Promise<AccountUser | null> {
  if (!authSecretConfigured()) return null;
  const db = getDb();
  const rows = await db.select().from(emailVerifications).where(eq(emailVerifications.tokenHash, sealToken(token, readAuthSecret()))).limit(1);
  const verification = rows[0];
  if (!verification || verification.expiresAt.getTime() < Date.now()) return null;
  const userRows = await db.select().from(users).where(eq(users.id, verification.userId)).limit(1);
  const user = userRows[0];
  if (!user) return null;
  const verifiedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: verifiedAt }).where(eq(users.id, verification.userId));
    await tx.delete(emailVerifications).where(eq(emailVerifications.userId, verification.userId));
  });
  return mapUser({ ...user, emailVerifiedAt: verifiedAt });
}

/** Whether a user has confirmed their email. */
export function isEmailVerified(user: Pick<AccountUser, "emailVerifiedAt">): boolean {
  return user.emailVerifiedAt !== null;
}

export async function completeConnectionTour(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ connectionTourCompletedAt: new Date() }).where(eq(users.id, userId));
}

export async function reopenConnectionTour(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ connectionTourCompletedAt: null }).where(eq(users.id, userId));
}

export async function setUserAccess(userId: string, role: Role, entityScope: string[]): Promise<void> {
  const db = getDb();
  await db.update(users).set({ role, entityScope: entityScope.join(",") }).where(eq(users.id, userId));
}

/** Change a user's own display name. Email is the sign-in identity and is not changed here. */
export async function updateUserName(userId: string, name: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

export async function deactivateUser(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "inactive" }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

export async function writeAudit(input: {
  organizationId: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  detail: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditEvents).values({
    id: newId("audit"),
    organizationId: input.organizationId,
    occurredAt: new Date(),
    actor: input.actor,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    detail: input.detail,
  });
}

export async function deleteOrganizationAccess(organizationId: string, emails: readonly string[]): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.organizationId, organizationId));
  const ids = existing.map((row) => row.id);
  if (ids.length > 0) await db.delete(sessions).where(inArray(sessions.userId, ids));
  await db.delete(invites).where(eq(invites.organizationId, organizationId));
  await db.delete(users).where(eq(users.organizationId, organizationId));
  if (emails.length > 0) await db.delete(signInAttempts).where(inArray(signInAttempts.email, [...emails]));
}

function mapUser(row: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: string;
  status: "active" | "invited" | "inactive";
  entityScope: string;
  connectionTourCompletedAt?: Date | null;
  emailVerifiedAt?: Date | null;
}): AccountUser {
  if (!isRole(row.role)) throw new Error(`Unknown role ${row.role}.`);
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    entityScope: row.entityScope.split(",").map((id) => id.trim()).filter(Boolean),
    passwordHash: row.passwordHash,
    connectionTourCompletedAt: row.connectionTourCompletedAt ?? null,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
