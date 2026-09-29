const POSTGRES_URL = /^postgres(ql)?:\/\//i;

/** DATABASE_URL is optional. When it is set, it must be a Postgres connection string. */
export function readDatabaseUrl(env: { DATABASE_URL?: string } = { DATABASE_URL: process.env.DATABASE_URL }): string | null {
  const raw = env.DATABASE_URL;
  if (raw === undefined || raw.trim() === "") return null;
  const url = raw.trim();
  if (!POSTGRES_URL.test(url)) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  }
  return url;
}
