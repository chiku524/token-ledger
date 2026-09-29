/**
 * Create the first owner for the organization already in Postgres.
 * Refuses to replace an existing active owner. Does not open public signup.
 */
import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { hashPassword } from "./password";
import { closeDb, getDb } from "../db/client";
import { organizations, users } from "../db/schema";
import { insertUser, writeAudit } from "../db/auth-store";

loadEnvFile();

async function main() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? "";
  const name = process.env.BOOTSTRAP_OWNER_NAME?.trim() || "Owner";
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to bootstrap an owner.");
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
  if (!email || !email.includes("@")) throw new Error("BOOTSTRAP_OWNER_EMAIL is required.");
  if (password.length < 12) throw new Error("BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters.");

  const db = getDb();
  const orgs = await db.select().from(organizations).limit(1);
  const organization = orgs[0];
  if (!organization) throw new Error("No organization in Postgres. Run pnpm db:seed first, or insert an organization.");

  const ownerRows = await db.select().from(users).where(eq(users.organizationId, organization.id));
  if (ownerRows.some((user) => user.role === "owner" && user.status === "active")) {
    console.log("An active owner already exists. Bootstrap did not create another.");
    return;
  }
  if (ownerRows.some((user) => user.email === email)) {
    throw new Error(`${email} already exists.`);
  }

  const id = await insertUser({
    organizationId: organization.id,
    email,
    name,
    role: "owner",
    entityScope: [],
    passwordHash: await hashPassword(password),
    status: "active",
  });
  await writeAudit({
    organizationId: organization.id,
    actor: `${name} <${email}>`,
    action: "user.bootstrapped",
    subjectType: "user",
    subjectId: id,
    detail: "Initial owner created by pnpm auth:bootstrap.",
  });
  console.log(`Created owner ${email} for ${organization.name}.`);
}

function loadEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
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
