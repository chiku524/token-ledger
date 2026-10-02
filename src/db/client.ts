import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { cloudflareContext, hyperdriveConnectionString } from "./availability";

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * On Cloudflare Workers the postgres client must be **per request**, not cached
 * across requests: Hyperdrive maintains the pool, and a client reused after its
 * request has returned hangs ("the Worker's code had hung") because its
 * underlying socket has been closed with the request's I/O context. The
 * ExecutionContext is stable within a request and new per request, so it is the
 * cache key. On Node (Vercel, scripts) the client is cached at module scope, as
 * before.
 */
const workerClients = new WeakMap<object, { client: ReturnType<typeof postgres>; database: Database }>();

let nodeClient: ReturnType<typeof postgres> | undefined;
let nodeDatabase: Database | undefined;

function resolveConnection(): { url: string; options: postgres.Options<Record<string, never>> } {
  const hyperdrive = hyperdriveConnectionString();
  if (hyperdrive) {
    // Hyperdrive pools, so a fresh short-lived client per request is expected.
    return { url: hyperdrive, options: { max: 5, prepare: true, fetch_types: false } };
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and point it at Postgres.");
  }
  return { url, options: { max: 1, prepare: false } };
}

export function getDb(): Database {
  const ctx = cloudflareContext();
  if (ctx?.ctx && typeof ctx.ctx === "object") {
    const cached = workerClients.get(ctx.ctx);
    if (cached) return cached.database;
    const { url, options } = resolveConnection();
    const client = postgres(url, options as postgres.Options<Record<string, never>>);
    const database = drizzle(client, { schema });
    workerClients.set(ctx.ctx, { client, database });
    return database;
  }

  if (!nodeDatabase || !nodeClient) {
    const { url, options } = resolveConnection();
    nodeClient = postgres(url, options as postgres.Options<Record<string, never>>);
    nodeDatabase = drizzle(nodeClient, { schema });
  }
  return nodeDatabase;
}

export async function closeDb(): Promise<void> {
  if (nodeClient) await nodeClient.end();
  nodeClient = undefined;
  nodeDatabase = undefined;
}
