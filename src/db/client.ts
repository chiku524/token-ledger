import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { hyperdriveConnectionString } from "./availability";

export type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

/**
 * The connection string, and how the driver should be configured for it.
 *
 * On Cloudflare Workers the OpenNext adapter sets the Cloudflare context on a
 * global symbol; the database is reached through a Hyperdrive binding. Hyperdrive
 * uses transaction pooling, so `prepare` must be `true` and `fetch_types` false
 * (Cloudflare's guidance for Postgres.js). On Node/Vercel, `DATABASE_URL` is used
 * with `prepare: false`, which is what a serverless/pooled Postgres expects.
 *
 * The context symbol is read directly rather than importing
 * `@opennextjs/cloudflare`, so the optional adapter is never part of the Vercel
 * build. It is the same symbol the adapter uses.
 */
function resolveConnection(): { url: string; options: postgres.Options<Record<string, never>> } {
  const hyperdrive = hyperdriveConnectionString();
  if (hyperdrive) {
    return { url: hyperdrive, options: { max: 5, prepare: true, fetch_types: false } };
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and point it at Postgres.");
  }
  return { url, options: { max: 1, prepare: false } };
}

export function getDb(): Database {
  if (!database || !client) {
    const { url, options } = resolveConnection();
    client = postgres(url, options as postgres.Options<Record<string, never>>);
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDb(): Promise<void> {
  if (client) await client.end();
  client = undefined;
  database = undefined;
}
