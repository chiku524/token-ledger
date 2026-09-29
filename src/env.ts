const POSTGRES_URL = /^postgres(ql)?:\/\//i;

/** Password sessions require a secret of at least 32 characters. Demo sign-in does not. */
export function authSecretConfigured(env: { AUTH_SECRET?: string } = { AUTH_SECRET: process.env.AUTH_SECRET }): boolean {
  return (env.AUTH_SECRET?.trim().length ?? 0) >= 32;
}

export function readAuthSecret(env: { AUTH_SECRET?: string } = { AUTH_SECRET: process.env.AUTH_SECRET }): string {
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return secret;
}

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
