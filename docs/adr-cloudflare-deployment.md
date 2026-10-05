# ADR: Cloudflare Workers as an optional deployment target

Status: proposed. Issue #98. **Low priority — post-deadline.**

## Context

The product deploys on Vercel, which is the supported target and the one CI
builds. Running the same app on Cloudflare Workers is a possible alternative,
but Workerd is not Node: it has no TCP sockets and no `node:crypto` `scrypt`, and
`vercel.json` crons do nothing there. This records what has been made portable,
what is deliberately left optional, and what a Cloudflare deploy still needs.

## Decision

Cloudflare is an **optional** target. It is not in the default install:

- No Cloudflare dependency is added to `package.json`. `wrangler.jsonc` sits in
  the repo but is only read by `wrangler`; the Vercel build ignores it.
- The committed `wrangler.jsonc` and this ADR are the whole of the Cloudflare
  surface. Nothing on the Vercel path imports or requires them.
- The portability work that *is* committed is dependency-free and benefits both
  runtimes, so it is safe on the default path.

## What was made runtime-portable (committed)

These changes remove the two hard blockers, with no new dependency, and keep the
Vercel behaviour identical:

- **Password hashing** (`src/auth/password.ts`) now uses PBKDF2-HMAC-SHA256 via
  Web Crypto, which exists on Node and Workerd alike. Legacy `scrypt$…` hashes
  are still verified on Node (lazily importing `node:crypto` so it is not pulled
  into a Worker bundle) and flagged by `needsRehash`. On a runtime without
  scrypt a legacy hash fails closed; the migration is to re-hash on next sign-in.
- **Credential sealing** (`src/adapters/credentials/crypto.ts`) now derives the
  AES-256-GCM key with PBKDF2 and writes `v2:` blobs. Legacy `v1:` scrypt blobs
  are still opened on Node. Sealing/opening became `async` through
  `store.ts`, `db/credentials.ts`, and `db/write.ts`.
- **Shared helpers** (`src/lib/webcrypto.ts`) use only `crypto.subtle`,
  `crypto.getRandomValues`, and `btoa`/`atob`.

The remaining `node:crypto` use (`createHash`, `createHmac`, `createSign`,
`createCipheriv`) is already implemented by Workerd's `nodejs_compat` shim, so it
does not block a Worker build.

## What a Cloudflare deploy still needs (not committed)

1. `pnpm add -D @opennextjs/cloudflare wrangler` (optional dependencies).
2. Confirm `@opennextjs/cloudflare` supports Next 16.3.6; otherwise pin to a
   compatible Next.
3. **Database access.** `src/db/client.ts` uses `postgres` (postgres-js) over
   TCP. On Workers, bind Hyperdrive (config template in `wrangler.jsonc`) or
   switch to `@neondatabase/serverless`. This is the one code change the port
   still requires.
4. `npx @opennextjs/cloudflare build && npx wrangler deploy`.
5. Set `DATABASE_URL` (or the Hyperdrive binding), `AUTH_SECRET`,
   `CONNECTOR_ENCRYPTION_KEY`, `CRON_SECRET`, `WEBHOOK_SIGNING_SECRET`, and the
   chain/RPC vars as Worker secrets.
6. The cron in `wrangler.jsonc` drives `/api/cron/sync`; `vercel.json` is unused.

## CPU limit (Error 1102) and the Workers Paid plan

The deployed Worker returns **Error 1102, "Worker exceeded resource limits"**
(`exceededCpu`) intermittently on the dashboard pages. Server-rendering these
pages costs **median ~37 ms, P90 ~480 ms, P99 ~950 ms** of CPU per request,
which is far above the **Workers Free** ceiling of **10 ms/request**. The
successful-render CPU times confirm this: failures are pinned at exactly
10,000 µs, the Free limit.

`wrangler.jsonc` sets `"limits": { "cpu_ms": 30000 }` to raise the ceiling to
30 s. **This setting is only honoured on the Workers Paid plan.** On Free the
platform ignores it and the Worker keeps being killed at 10 ms. A Next.js
server-rendering app cannot fit in 10 ms, so **the Workers Paid plan is
required** for this app on Cloudflare. To reduce cold-start and per-request
CPU regardless of plan:

- Chart components (which pull `recharts`, several hundred KB) are loaded
  client-only via `src/components/charts/lazy.tsx` (`ssr: false`), so the server
  bundle no longer evaluates them. This removed ~490 KB from the Worker.

Error 1102 is a runtime kill, not a catchable exception, so a React
`error.tsx` boundary cannot show a friendly message for it; the only fixes are
raising the CPU limit (Paid) or lowering CPU (above).

## Consequences

- The default Vercel deploy is unchanged: same commands, same migrations.
- Existing scrypt password hashes and `v1` credential blobs keep working on Node.
  A Cloudflare deploy should re-hash passwords on next sign-in and re-seal
  credentials as `v2`, because scrypt is absent there.
- The only remaining code change for Cloudflare is the database driver; the
  crypto blockers are removed.
- **Cloudflare requires the Workers Paid plan.** The Free plan's 10 ms CPU
  budget is below the cost of server-rendering a single dashboard page.
