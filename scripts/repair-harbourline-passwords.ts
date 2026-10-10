/**
 * Reset Harbourline example user passwords (and ensure users exist) without a
 * full org wipe. Use when `pnpm db:seed` cannot delete users due to newer FKs,
 * or when only credentials need refreshing on the Cloudflare Hyperdrive DB.
 */
import { eq } from "drizzle-orm";
import { EXAMPLE_USERS } from "../src/auth/example-users";
import { hashPassword } from "../src/auth/password";
import { closeDb, getDb } from "../src/db/client";
import { users } from "../src/db/schema";

const ORG_ID = "org_harbourline";

async function main() {
  const db = getDb();
  const results: Array<{ email: string; action: string }> = [];

  for (const user of EXAMPLE_USERS) {
    const passwordHash = await hashPassword(user.password);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email)).limit(1);
    if (existing[0]) {
      await db
        .update(users)
        .set({
          passwordHash,
          status: "active",
          role: user.role,
          name: user.name,
          entityScope: user.entityScope.join(","),
          organizationId: ORG_ID,
        })
        .where(eq(users.email, user.email));
      results.push({ email: user.email, action: "password_reset" });
    } else {
      const scopeSuffix = user.entityScope.length ? "_sg" : "";
      await db.insert(users).values({
        id: `user_example_${user.role}${scopeSuffix}`,
        organizationId: ORG_ID,
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
        status: "active",
        entityScope: user.entityScope.join(","),
      });
      results.push({ email: user.email, action: "created" });
    }
  }

  console.log(JSON.stringify({ organizationId: ORG_ID, users: results }));
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closeDb();
    process.exitCode = 1;
  });
