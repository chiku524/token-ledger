# ADR: Container deployment as an optional target

Status: proposed. Issue #100. **Low priority — post-deadline.**

## Context

Vercel is the supported target. Some teams want a crypto-native or
infrastructure-neutral host instead: Akash, Spheron, and Flux sell ordinary
Linux containers, which is a different trade from the Cloudflare Workers port in
`docs/adr-cloudflare-deployment.md`.

Workerd has no TCP sockets and no `node:crypto` `scrypt`, so Workers needed a
crypto rewrite and still needs a database-driver swap. A container is real
Linux: `postgres`, scrypt, and every Node API work unchanged. The cost is a
Dockerfile and a deploy manifest, not application changes.

## Decision

Ship a container path as an **optional** target, off by default:

- `output: "standalone"` is enabled only when `DEPLOY_TARGET=container`, so the
  Vercel build is byte-for-byte unchanged.
- `Dockerfile` is a multi-stage build (deps → build → runner) on `node:22-slim`,
  running as a non-root user and listening on `0.0.0.0:3000`.
- `.dockerignore` keeps `.env*`, `.next`, `node_modules`, and local scratch out
  of the image.
- `deploy/akash.yaml` is an Akash SDL v2.0 starting point. It references secrets
  as empty values; they are supplied at deploy time, never committed.

No application code changes: the crypto stays as-is and `postgres-js` connects
over TCP as it does on Vercel.

## Usage

```bash
DEPLOY_TARGET=container pnpm build
docker build -t ghcr.io/OWNER/token-ledger:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e AUTH_SECRET=... \
  -e CONNECTOR_ENCRYPTION_KEY=... \
  -e CRON_SECRET=... \
  -e WEBHOOK_SIGNING_SECRET=... \
  ghcr.io/OWNER/token-ledger:latest
```

For Akash: push the image, edit the image name in `deploy/akash.yaml`, supply the
secrets through the provider's secret store, and `provider-services tx deployment
create deploy/akash.yaml`. Any host that runs a container works the same way.

## Consequences

- The default Vercel deploy is unchanged; `DEPLOY_TARGET` is unset there.
- The container keeps scrypt and `postgres` exactly as the Node code expects, so
  unlike Workers there is no re-hash or re-seal step.
- The scheduler is a route (`/api/cron/sync`), so a container host drives it with
  its own cron or an external pinger; `vercel.json` and `wrangler.jsonc` are
  unused here.
- The image is ~300 MB (the standalone runtime is small; the base image
  dominates). A distroless or Alpine base could shrink it if that matters.

## Verified

`DEPLOY_TARGET=container pnpm build` writes `.next/standalone/server.js`, and
`docker build` + `docker run` served `/` and `/sign-in` (200) with `/dashboard`
correctly redirecting to sign-in under `NODE_ENV=production`.
