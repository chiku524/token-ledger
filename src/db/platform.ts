/**
 * Platform-wide reads for the platform-admin panel: every organization with its
 * user/entity counts, and every user with the organization they belong to and
 * when they last signed in.
 *
 * These queries deliberately cross organization boundaries and must be reached
 * only through a platform-admin session (see `requirePlatformAdmin`). They are
 * read-only except `setUserStatus`.
 */
import { count, desc, eq, max } from "drizzle-orm";
import { getDb } from "./client";
import { entities, organizations, sessions, users } from "./schema";

export interface PlatformOrg {
  id: string;
  name: string;
  origin: "example" | "live";
  createdAt: string;
  userCount: number;
  entityCount: number;
  ownerEmails: string[];
  lastActivityAt: string | null;
}

export interface PlatformUser {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  name: string;
  role: string;
  status: "active" | "invited" | "inactive";
  platformAdmin: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastSignedInAt: string | null;
}

/** Every organization, with counts and its owner emails. */
export async function listPlatformOrgs(): Promise<PlatformOrg[]> {
  const db = getDb();
  const [orgRows, userRows, entityRows] = await Promise.all([
    db.select().from(organizations).orderBy(desc(organizations.createdAt)),
    db
      .select({
        organizationId: users.organizationId,
        email: users.email,
        role: users.role,
        status: users.status,
      })
      .from(users),
    db
      .select({ organizationId: entities.organizationId, id: entities.id })
      .from(entities),
  ]);

  const counts = new Map<string, { users: number; owners: string[] }>();
  for (const row of userRows) {
    const entry = counts.get(row.organizationId) ?? { users: 0, owners: [] };
    entry.users += 1;
    if (row.role === "owner" && row.status === "active") entry.owners.push(row.email);
    counts.set(row.organizationId, entry);
  }
  const entityCounts = new Map<string, number>();
  for (const row of entityRows) entityCounts.set(row.organizationId, (entityCounts.get(row.organizationId) ?? 0) + 1);

  return orgRows.map((org) => {
    const entry = counts.get(org.id) ?? { users: 0, owners: [] };
    return {
      id: org.id,
      name: org.name,
      origin: org.origin,
      createdAt: org.createdAt.toISOString(),
      userCount: entry.users,
      entityCount: entityCounts.get(org.id) ?? 0,
      ownerEmails: entry.owners,
      lastActivityAt: null,
    };
  });
}

/** Every user across every organization, newest first, with last sign-in. */
export async function listPlatformUsers(): Promise<PlatformUser[]> {
  const db = getDb();
  const [userRows, orgRows, lastSeen] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ id: organizations.id, name: organizations.name }).from(organizations),
    db
      .select({ userId: sessions.userId, last: max(sessions.createdAt) })
      .from(sessions)
      .groupBy(sessions.userId),
  ]);
  const orgName = new Map(orgRows.map((org) => [org.id, org.name]));
  const seen = new Map(lastSeen.map((row) => [row.userId, row.last]));

  return userRows.map((user) => ({
    id: user.id,
    organizationId: user.organizationId,
    organizationName: orgName.get(user.organizationId) ?? "—",
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    platformAdmin: user.platformAdmin,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
    lastSignedInAt: seen.get(user.id) ? seen.get(user.id)!.toISOString() : null,
  }));
}

/** A headline count for the panel. */
export async function platformTotals(): Promise<{ organizations: number; users: number }> {
  const db = getDb();
  const [orgRows, userRows] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
  ]);
  return { organizations: Number(orgRows[0]?.value ?? 0), users: Number(userRows[0]?.value ?? 0) };
}

/** Set a user's status (active/inactive) platform-wide. Audited by the caller. */
export async function setPlatformUserStatus(userId: string, status: "active" | "inactive"): Promise<void> {
  const db = getDb();
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

/** Grant or revoke the platform-admin role. Audited by the caller. */
export async function setPlatformUserAdmin(userId: string, platformAdmin: boolean): Promise<void> {
  const db = getDb();
  await db.update(users).set({ platformAdmin }).where(eq(users.id, userId));
}
