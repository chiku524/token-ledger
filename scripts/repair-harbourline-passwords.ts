/**
 * Reset Harbourline example user passwords (and ensure users exist) without a
 * full org wipe. Targets the org that already owns Harbourline demo users when
 * `org_harbourline` is missing (common on the Cloudflare Hyperdrive DB).
 */
import { eq, like, or } from "drizzle-orm";
import { EXAMPLE_USERS } from "../src/auth/example-users";
import { hashPassword } from "../src/auth/password";
import { closeDb, getDb } from "../src/db/client";
import { organizations, users } from "../src/db/schema";

const PREFERRED_ORG_ID = "org_harbourline";

async function resolveOrganizationId(): Promise<string> {
  const db = getDb();
  const [preferred] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, PREFERRED_ORG_ID))
    .limit(1);
  if (preferred) return preferred.id;

  const [byName] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, "Harbourline Digital"))
    .limit(1);
  if (byName) return byName.id;

  const [fromUser] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(like(users.email, "%@harbourline.example"))
    .limit(1);
  if (fromUser) return fromUser.organizationId;

  await db.insert(organizations).values({
    id: PREFERRED_ORG_ID,
    name: "Harbourline Digital",
    origin: "example",
  });
  return PREFERRED_ORG_ID;
}

async function main() {
  const db = getDb();
  const organizationId = await resolveOrganizationId();
  const results: Array<{ email: string; action: string }> = [];

  for (const user of EXAMPLE_USERS) {
    const passwordHash = await hashPassword(user.password);
    const scopeSuffix = user.entityScope.length ? "_sg" : "";
    const preferredId = `user_example_${user.role}${scopeSuffix}`;

    const existing = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(or(eq(users.email, user.email), eq(users.id, preferredId)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(users)
        .set({
          email: user.email,
          passwordHash,
          status: "active",
          role: user.role,
          name: user.name,
          entityScope: user.entityScope.join(","),
          organizationId,
        })
        .where(eq(users.id, existing[0].id));
      results.push({ email: user.email, action: "password_reset" });
      continue;
    }

    await db.insert(users).values({
      id: preferredId,
      organizationId,
      email: user.email,
      name: user.name,
      passwordHash,
      role: user.role,
      status: "active",
      entityScope: user.entityScope.join(","),
    });
    results.push({ email: user.email, action: "created" });
  }

  console.log(JSON.stringify({ organizationId, users: results }));
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    if (error && typeof error === "object" && "cause" in error) {
      console.error(String((error as { cause?: unknown }).cause));
    }
    await closeDb();
    process.exitCode = 1;
  });
