/**
 * Whether a database is configured, without importing a driver. True when a
 * Hyperdrive binding is present (Cloudflare Workers, set by the OpenNext adapter
 * on a global symbol) or DATABASE_URL is set (Node). The symbol is read directly
 * so this module stays dependency-free and safe to import anywhere.
 */
export function hasDatabase(): boolean {
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as
    | { env?: { HYPERDRIVE?: { connectionString?: string } } }
    | undefined;
  const binding = ctx?.env?.HYPERDRIVE?.connectionString;
  if (typeof binding === "string" && binding.length > 0) return true;
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.trim() !== "";
}

/** The Hyperdrive connection string, when running on a Worker. */
export function hyperdriveConnectionString(): string | null {
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as
    | { env?: { HYPERDRIVE?: { connectionString?: string } } }
    | undefined;
  const binding = ctx?.env?.HYPERDRIVE?.connectionString;
  return typeof binding === "string" && binding.length > 0 ? binding : null;
}
