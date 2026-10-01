# Optional container image (issue #100). The supported target is Vercel; this is
# for a container host such as Akash, Spheron, or Flux, which run plain Linux and
# so keep postgres-js and every Node API working unchanged.
#
#   DEPLOY_TARGET=container pnpm build   # writes .next/standalone
#   docker build -t token-ledger .
#   docker run -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... token-ledger
#
# See docs/adr-container-deployment.md.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---- dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Standalone output so the runner needs no node_modules.
ENV DEPLOY_TARGET=container
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone traces its own minimal node_modules; static assets sit alongside it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
