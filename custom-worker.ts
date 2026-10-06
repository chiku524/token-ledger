// The `.open-next/worker.js` module is generated at build time and is excluded
// from the app's tsconfig; the bundler resolves it, not `tsc`.
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore generated at build time
import { default as handler } from "./.open-next/worker.js";

/**
 * Custom Cloudflare Worker entry. OpenNext's generated worker exports only a
 * `fetch` handler, so a Wrangler cron trigger — which fires a `scheduled` event —
 * has nothing to call. This wrapper re-uses the generated `fetch` and adds a
 * `scheduled` handler that invokes the app's cron routes over HTTP.
 *
 * Wrangler `main` points here (see wrangler.jsonc). Rebuild with `pnpm cf:build`.
 * The Cloudflare handler types are declared locally so this file typechecks under
 * the app's DOM tsconfig without pulling in the generated worker globals.
 */

/** Minimal Cloudflare runtime types used here (avoid the global workers-types). */
interface CronEnv {
  ASSETS: unknown;
  APP_URL?: string;
  CRON_SECRET?: string;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledControllerLike {
  /** The cron expression that triggered this event, e.g. "0 3 * * *". */
  cron: string;
}

/**
 * The routes a scheduled trigger runs. The trigger's `cron` selects which, so a
 * daily schedule can run the sync while another tick runs the indexer.
 */
function routeForCron(cron: string): string[] {
  const paths = ["/api/cron/indexer"];
  // The sync cron is the 3am daily schedule in wrangler.jsonc; the indexer runs
  // on its own tick. Any unlisted cron still runs the indexer, which is safe to
  // run often (it is idempotent and bounded).
  if (cron.startsWith("0 3 ")) paths.push("/api/cron/sync");
  return paths;
}

const worker = {
  fetch: handler.fetch,

  async scheduled(event: ScheduledControllerLike, env: CronEnv, ctx: ExecutionContextLike): Promise<void> {
    const base = env.APP_URL?.replace(/\/$/, "");
    if (!base) {
      // No base URL configured means the app routes cannot be reached; do nothing
      // rather than guess a host.
      return;
    }
    const authorization = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : undefined;
    for (const path of routeForCron(event.cron)) {
      const run = fetch(`${base}${path}`, authorization ? { headers: { authorization } } : undefined).then(
        (response) => {
          if (!response.ok) console.error(`cron ${path} returned ${response.status}`);
        },
        (error) => console.error(`cron ${path} failed`, error),
      );
      ctx.waitUntil(run);
    }
  },
};

export default worker;

// Required because the app uses the OpenNext DO queue and tag cache.
// @ts-ignore generated at build time
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
/* eslint-enable @typescript-eslint/ban-ts-comment */
