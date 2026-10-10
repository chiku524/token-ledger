/**
 * Post-seed sanity check for CI. Prints host + counts only (no connection string).
 * Exits non-zero if the demo owner is missing or password verification fails.
 */
import postgres from "postgres";
import { verifyPassword } from "../src/auth/password";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const host = new URL(url).hostname;
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const users = await sql`
      select email, role, status from users
      where email like ${"%@harbourline.example"}
      order by email`;
    const [owner] = await sql`select password_hash from users where email = ${"owner@harbourline.example"}`;
    const ownerPasswordOk = owner ? await verifyPassword("Harbourline-owner-1", owner.password_hash) : false;
    const [conns] = await sql`select count(*)::int as n from connections where organization_id = ${"org_harbourline"}`;
    const [snaps] = await sql`select count(*)::int as n from balance_snapshots where organization_id = ${"org_harbourline"}`;
    const summary = {
      host,
      harbourlineUsers: users.length,
      ownerPasswordOk,
      connections: conns?.n ?? 0,
      balanceSnapshots: snaps?.n ?? 0,
    };
    console.log(JSON.stringify(summary));
    // Password must verify. Connections are best-effort (full seed may still fail
    // on leftover FKs); demo login only needs the owner hash.
    if (!ownerPasswordOk) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
