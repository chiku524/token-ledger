# Token Ledger

Accounting and financial-data layer for digital assets. Token Ledger consolidates a company's crypto — hot wallets, cold wallets, staking positions, custodians, and exchanges, across chains such as Ethereum, Solana, Polygon, Bitcoin, and Sui — into one double-entry subledger.

The first markets are Malaysia and Singapore. The reporting frame is IFRS: an audit trail, reconciliation to every source, and journals that can sync to Xero, QuickBooks, and ERPs.

Planned tiers:

- **Startup** — Web3 startups and funds, quarterly reporting.
- **Institutional** — TradFi and scaling Web3 firms, monthly reporting, multi-entity consolidation, and asset valuation reporting.

Later: token treasury and lifecycle management for issuers, and an AI-assisted close. This repository is the foundation for that product, not the finished product. Connectors are read-only; the chain readers for Ethereum, Solana, Polygon, Bitcoin, and Sui are live and the rest are stubs. Without `DATABASE_URL`, the dashboard runs on fictional example books for Harbourline Digital. With `DATABASE_URL`, pages read that Postgres database instead. A consolidation page translates MYR and SGD with stored rates. The Harbourline rates are example data, not a market price.

## Stack

Next.js (App Router) and TypeScript, Postgres with Drizzle, pnpm. The app deploys on Vercel. The UI does not need a database: it reads the example books in process. Postgres is there for the schema, migrations, and seed.

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the product page. The books are behind sign-in. Without `DATABASE_URL`, the sign-in page offers a demo role preview of the example books.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

How the tests are organized, and how to test a new server action or page, is in [docs/testing.md](docs/testing.md).

Manual HTTP tests for the route handlers ship as a [Bruno](https://www.usebruno.com/) collection in [`bruno/`](bruno/README.md) (chat, crons, webhook, and the CSV/PDF exports). Open that folder as a collection, or run a request with `npx @usebruno/cli run bruno/api/cron/sync.bru --env local`.

## Database

Optional until you want to record entities, sources, journals, reversals, or a CSV import. The forms stay read-only when `DATABASE_URL` is unset.

```bash
cp .env.example .env
# edit DATABASE_URL — postgres:// or postgresql://
pnpm db:migrate
pnpm db:seed
```

`DATABASE_URL` is optional. If it is set, it must be a Postgres URL. `AUTH_SECRET` is required for password sessions and must be at least 32 characters. `db:generate` writes a new SQL migration from `src/db/schema.ts` and does not need a running database. `db:seed` reloads the Harbourline example organization, including its example FX rate, audit events, and fictional users, and replaces that organization's previous rows. It does not delete other organizations. Reloading the example is the one path that deletes posted journals, and it sets a transaction-local flag the immutability trigger recognizes.

CI applies the migrations and the seed to a real Postgres on every push, and fails when `pnpm db:generate` would produce a migration that is not committed.

Posted journals and the audit log reject updates. A wrong journal is corrected by posting a reversal. The actor on a new posting is the signed-in user.

## Authentication and roles

Sign-in is a database session. Passwords are hashed with scrypt (N=16384, r=8, p=1). The session cookie `tl_session` is httpOnly, SameSite=Lax, and a 12-hour token. Only a hash of that token, bound to `AUTH_SECRET`, is stored. Mutations also require a CSRF cookie that matches the form, and an Origin host that matches this app. Five failed sign-ins for an email within 15 minutes lock further attempts until the window ages out. A new organization starts at `/sign-up`. The wizard can connect a wallet, an exchange, a custodian, or any combination. Those connections are managed later in Settings. Connections stay read-only — scopes are balances and movements.

Create the first owner after the database has an organization:

```bash
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET, BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD (12+ characters)
pnpm db:migrate
pnpm db:seed
pnpm auth:bootstrap
```

`pnpm auth:bootstrap` refuses to add another owner when an active owner already exists. Owners and admins then invite people from **Users**. The invite is emailed when email is configured, and the link is also shown once in the page. It expires in 7 days. The invited person sets a password at `/sign-in?invite=...`. An owner or admin is then asked, step by step, to connect a wallet, an exchange, and a custodian. Each step can be skipped.

| Role | Books | Export and audit | Prepare journals | Approve | Post, reverse, match, CSV import | Entities, sources, FX, close | Users |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Owner | Read | Yes | Yes | Yes | Yes | Yes | Everyone, including owners |
| Admin | Read | Yes | Yes | Yes | Yes | Yes | Everyone except owners |
| Accountant | Read | Yes | Yes | No | Yes | No | No |
| Approver | Read | Yes | Yes | Yes | No | No | No |
| Viewer | Read | Yes | No | No | No | No | No |

An empty entity scope means every entity. A comma-separated scope limits accountants and viewers to those entities. Owners and admins are not narrowed by scope. The audit log stays organization-wide. The last active owner cannot be demoted or deactivated. Nobody can deactivate themselves or change their own role.

Demo sign-in is only for the example books: it is allowed when `DATABASE_URL` is unset, `NODE_ENV` is not `production`, and `VERCEL_ENV` is not `production`. A configured database never accepts a demo cookie. Pick a role on the sign-in page to preview permissions. Nothing is saved.

`pnpm db:seed` also creates these fictional local-dev users. The passwords are not for production.

| Email | Role | Password | Scope |
| --- | --- | --- | --- |
| owner@harbourline.example | Owner | Harbourline-owner-1 | All entities |
| admin@harbourline.example | Admin | Harbourline-admin-1 | All entities |
| accountant@harbourline.example | Accountant | Harbourline-accountant-1 | All entities |
| approver@harbourline.example | Approver | Harbourline-approver-1 | All entities |
| viewer@harbourline.example | Viewer | Harbourline-viewer-1 | All entities |
| viewer.sg@harbourline.example | Viewer | Harbourline-viewer-sg-1 | Singapore entity only |

Harbourline stores one example rate, 1 MYR = 0.3000 SGD. SGD amounts use the exact inverse (10/3), which is not a second stored rate.

FX and prices are live (see below). Email is optional (see "Email and account self-service").

## Email and account self-service

Transactional email (invites, password reset, email verification) uses Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. Email is optional: without it, nothing is sent, an invite falls back to the on-screen link, and the reset and verify flows report that nothing went out. Tokens and message bodies are never logged.

- **Invites** are emailed when configured; the link is still shown once. Every invite is audited whether or not it was sent.
- **Password reset** (`/reset-password`) always responds the same way, so it does not disclose whether an email has an account. Setting a new password signs out existing sessions.
- **Email verification** sends a link on sign-up; an unverified account still works but shows a banner to confirm.
- `APP_URL` sets the base for links; unset, the request host is used.

See `docs/adr-email.md`.

## Reconciliation and accounting controls

- **Approval workflow.** A journal can be saved as a draft, submitted, then approved. Only an approver (or owner/admin) approves, and approval is what inserts the immutable posted entry; a draft is never a posted row. An approver cannot approve their own entry unless an owner overrides with a note, and the override is audited. Posted entries stay immutable.
- **Manual matching.** Reconciliation is derived on load; a manual match or unmatch is stored as an override and overlaid on the automatic result, with a required note and an audit event.
- **Period close.** Owner or admin can close a date range per company; posting, reversing, and re-matching inside it are refused until it is reopened. Each close and reopen is audited.
- **Audit log.** The History page filters by name, action, subject, and dates, and downloads the filtered log as CSV. The log is organization-wide and append-only.

Roles: owner, admin, accountant, **approver**, viewer. An approver reads and approves but cannot post directly.

## Market data and valuation

Environment variables:

- `DATABASE_URL` — optional Postgres URL. Unset means example books and demo sign-in.
- `AUTH_SECRET` — required for password sessions, at least 32 characters.
- `CONNECTOR_ENCRYPTION_KEY` — required to store exchange credentials, at least 32 characters, server-only. Derives the AES-256-GCM key that seals secrets at rest.
- `CRON_SECRET` — optional. When set, the scheduled sync route (`/api/cron/sync`) requires it as a bearer token; Vercel Cron sends it automatically. At least 16 characters.
- `WEBHOOK_SIGNING_SECRET` — required to accept signed source webhooks (`/api/webhooks/source`), at least 32 characters, server-only. A per-source signing secret is derived from it.
- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` — optional. Transactional email. Unset means nothing is sent and the flows fall back.
- `APP_URL` — optional. The base URL for links in emails. Unset uses the request host.
- `WEBHOOK_URL` — optional. The receiver URL `pnpm webhook:send` posts to.
- `KRAKEN_API_KEY`/`_SECRET`, `BYBIT_API_KEY`/`_SECRET`, `BINANCE_API_KEY`/`_SECRET`, `GATE_API_KEY`/`_SECRET`, `BACKPACK_API_KEY`/`_SECRET` — read-only keys used by `pnpm exchange:verify`. In the app a credential is entered by the user and stored sealed.
- `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_NAME`, `BOOTSTRAP_OWNER_PASSWORD` — used only by `pnpm auth:bootstrap`.
- `SOLANA_RPC_URL` — optional. A private Solana RPC endpoint. Unset uses the free, keyless public cluster (`https://api.mainnet-beta.solana.com`). Must be `https://` with no embedded credentials.
- `ALCHEMY_API_KEY` — optional. Unlocks EVM ERC-20 balances and transfers for Ethereum and Polygon. Unset falls back to a keyless public RPC for native balances only.
- `EVM_RPC_URL_ETHEREUM`, `EVM_RPC_URL_POLYGON` — optional per-chain EVM RPC overrides. `https://` only, no embedded credentials.
- `BITCOIN_ESPLORA_URL` — optional. A self-hosted Esplora instance or Blockstream. Unset uses the keyless mempool.space API. `https://` only, no embedded credentials.
- `SUI_RPC_URL` — optional. A Sui GraphQL endpoint. Unset uses the keyless public endpoint (`https://graphql.mainnet.sui.io/graphql`). Uses GraphQL because Sui Foundation removed JSON-RPC from its public nodes (see `docs/adr-sui-data-source.md`).

Verify a live chain read with `pnpm chain:verify [solana|ethereum|polygon|bitcoin|sui] [ADDRESS]`, a live exchange read with `pnpm exchange:verify [kraken|bybit|binance|gate|backpack]`, and a live custodian read with `pnpm custodian:verify [bitgo|fireblocks]` (needs a read-only token).

CSV import expects a header of `external_id,occurred_on,asset_code,direction,quantity,description`. Quantity is in major units. Import records source facts for reconciliation and does not post a journal.

Chain, Xero, and QuickBooks credentials are not stored. A connection stores an address or account id, the scopes `balances,movements`, a status, and a sync cursor. Exchange and custodian credentials are the exception: a read-only API key and secret (or viewer credential) are entered by the user, sealed with AES-256-GCM under `CONNECTOR_ENCRYPTION_KEY`, and stored in `connection_credentials`. The plaintext never reaches the database and is never returned to the browser. The chain readers are live and read-only: they call JSON-RPC and never sign. Every other adapter in `src/adapters` throws before making a network call. Checking a connection records the outcome. It does not post a journal. Observed balances are separate from booked value.

Exchange connectors are live and read-only for Kraken, Bybit, Binance, Gate.io, and Backpack (see `docs/adr-exchange-connectors.md`). Custodian connectors are live and read-only for BitGo and Fireblocks (see `docs/adr-custodian-connectors.md`); a view-only token or Viewer API user cannot sign or move funds. A user authorises an exchange or custodian from the frontend: they enter a read-only credential, it is checked by a real read-only call, then sealed and stored. The chain readers return native and registered token balances as observed balances, and derive movements from the net change (Solana, Bitcoin) or balance changes (EVM, Sui) for a watched address. Sui reads through GraphQL, since JSON-RPC was removed from Sui's public nodes. Bitcoin has no token layer, so only BTC is modelled, and a transaction's change is cancelled by the net calculation. Unknown tokens are skipped rather than guessed; registries (`src/adapters/sources/solana/mints.ts`, `src/adapters/sources/evm/tokens.ts`) map well-known tokens to an asset code. At the sync boundary the same rule applies: an asset the organization does not track is skipped and the run is marked `partial`, so one unrecognised token cannot sink an otherwise-good pull. See `docs/adr-solana-data-source.md`, `docs/adr-evm-data-source.md`, `docs/adr-bitcoin-data-source.md`, and `docs/adr-sui-data-source.md` for the endpoint choices and rate limits.

On Vercel, import this repo as a Next.js project. Set `DATABASE_URL` when you attach Postgres (Neon via the Vercel Marketplace is a straightforward fit). The example UI still renders if that variable is unset.

**Optional: Cloudflare Workers.** Vercel is the supported target; Cloudflare is an optional, low-priority alternative (issue #98). Password hashing and credential sealing are already on Web Crypto so they run on Workerd, and `wrangler.jsonc` holds the Worker config and cron. The one remaining change is the database driver: bind Hyperdrive or use a serverless HTTP driver in `src/db/client.ts`. Cloudflare needs no dependency in the default install — add `@opennextjs/cloudflare` and `wrangler` only when you build for it. See `docs/adr-cloudflare-deployment.md`.

**Optional: containers.** For a crypto-native or neutral host (Akash, Spheron, Flux), a committed `Dockerfile` and `deploy/akash.yaml` build and run the app unchanged — a container is real Linux, so `postgres` and the Node crypto work as-is, with no Workers-style rewrite. The standalone output is enabled only with `DEPLOY_TARGET=container`, so the Vercel build is unaffected. See `docs/adr-container-deployment.md`.

```bash
DEPLOY_TARGET=container pnpm build
docker build -t token-ledger .
docker run -p 3000:3000 -e DATABASE_URL=... -e AUTH_SECRET=... token-ledger
```

Report pages can download a trial balance, journal, or reconciliation CSV for the selected period. The export route is `/dashboard/reports/export`.

## Market data and valuation

Holdings can be valued at sourced, dated market prices, and rates and prices carry their provenance and age. Prices come from CoinGecko and FX rates from the ECB reference rates (both keyless and read-only), stored with `origin` (`example` or `live`), `as_of`, and `source`. A price never posts to the journal.

- `asset_prices` stores prices as rational `numeric(78,0)` minor units. `fx_rates` stores each ordered pair once; the inverse is derived.
- **Sources** shows a Market value section: observed holdings valued in USD, with source, origin, and a fresh/stale badge. An unpriced holding is listed, not hidden; a stale total is flagged provisional.
- **Reports** shows a revaluation proposal (carrying vs market) and a form to post one balanced entry for the net gain or loss. Nothing posts automatically; reverse it if the price was wrong.
- **Combined** shows an IAS 21 translation alongside the single-rate view: closing rate for assets/liabilities, average for income/expense, difference to a translation reserve.
- Refresh from the UI (**Refresh prices and rates**), the scheduled cron pass, or `pnpm market:refresh [ORG_ID] [--prices|--fx]`. A fetch failure never blocks sync; the last value ages out visibly.

See `docs/adr-market-data.md`.

Posted entries can be pushed to an external accounting system: Xero (manual journals), QuickBooks Online (journal entries), or a generic ERP through the `AccountingSyncAdapter` port. Pushes are idempotent — a retry cannot create a duplicate. These are the only write path in the product and need OAuth app credentials to run live; see `docs/adr-accounting-sync.md`.

## AI assistant

An assistant that can do anything a signed-in user can do — open the right page,
explain a number, and prepare an entry — under the user's real role and entity
scope. It drives the **same server actions the UI calls**; it is not a second
accounting system and cannot escalate privilege. The capability handbook is
`docs/ai-chatbot.md`; the decision is `docs/adr-ai-assistant.md`.

- **Providers.** One interface covers Ollama, Anthropic Claude, OpenAI ChatGPT,
  Hugging Face, OpenRouter, and any OpenAI-compatible endpoint. No LLM SDK is in
  the default install — each provider is a `fetch` adapter, tested offline.
- **Reads run; writes wait.** A read tool runs immediately. A write (post,
  match, close, prepare an on-chain payment) is proposed and does nothing until
  the user confirms it explicitly; every write is audited.
- **Retrieval (RAG).** With `AI_EMBEDDING_PROVIDER` set, the assistant recalls
  relevant earlier messages, org- and entity-scoped, with citations.
- **Voice.** With `ELEVENLABS_API_KEY` set, each reply has a **Read aloud**
  control (text-to-speech, server-side key) and the composer has **dictation**
  (browser speech-to-text). Unset means no voice and no other change.
- **In the UI.** A launcher is on every dashboard page: a floating button that
  opens a window (or a docked sidebar on large screens). It streams replies,
  opens the page a request names, and shows a confirmation card before any write
  runs. Built on `assistant-ui`, but the panel only presents — our backend stays
  authoritative.

Set `AI_PROVIDER` to turn it on (see `.env.example`); unset means the assistant
is off and the rest of the app is unaffected. `pnpm ai:embed-backfill` embeds
existing message history for retrieval.

Every sign-up creates its own organization with the registrant as its owner, so the dashboard's **Users** page lists only *your* organization's people. To see everyone across every organization, set `PLATFORM_ADMIN_EMAILS` (a comma-separated email allowlist) and open **Platform** in the account menu: it lists each organization with its user/company counts, and every user with their organization, role, status, verification, and last sign-in. This cross-organization view is separate from any organization role — an org owner or admin does not get it.

## Scheduled sync and operations

Connections pull on a schedule, not only on a click. Every pull goes through one path (`runConnectionSync`) and leaves a row in `sync_runs` with its outcome, trigger, and counts. Raw adapter payloads are retained as JSONB for the most recent runs and then age out. A failing connection is retried with a growing backoff (5m, 30m, 2h, 6h) and marked degraded after a failure that follows a success.

- Vercel Cron calls `GET /api/cron/sync` on the schedule in `vercel.json` (once daily at 03:00 UTC, which fits the Hobby plan). On Pro, tighten it to `*/15 * * * *` to match the in-code interval. Any scheduler that can send the bearer token can call the route instead. With `CRON_SECRET` set, the route requires it as a bearer token; Vercel sends it automatically. Without a database the pass is a no-op.
- `pnpm sync:run` runs the same pass locally — all organizations, or one with `pnpm sync:run <ORG_ID> --all` to ignore the interval and backoff.
- **Operations** in the dashboard shows each connection's last run, counts, error, and health, with failing connections first, and offers a manual re-run.

Sources that can push post a signed JSON event to `POST /api/webhooks/source`. The signature header is Stripe-like: `X-Token-Ledger-Signature: t=<unix seconds>,v1=<hex hmac-sha256>` over `${t}.${rawBody}`, with the per-source secret derived from `WEBHOOK_SIGNING_SECRET`. A timestamp outside five minutes is rejected, and the unique `(source, external id)` key makes a redelivery a no-op. `pnpm webhook:send <SOURCE_ID> <ASSET_CODE> <in|out> <QUANTITY>` sends a signed event for local verification. See `docs/adr-scheduled-ingestion.md`.

## Layout
```text
src/app                 Landing page, sign-in, and dashboard
src/auth                Passwords, sessions, roles, demo sign-in, and the owner bootstrap
src/proxy.ts            Sends unsigned visitors from /dashboard to /sign-in
src/ledger              Double-entry posting, reversals, FX, trial balance, reconciliation, CSV
src/db                  Drizzle schema, client, seed, read, and write
src/adapters            Source readers (chains, exchanges, custodians), a shared adapter contract
                        (contract-suite.ts), and accounting sync (Xero, QuickBooks, ERP)
src/ai                  The assistant: LLM provider port and adapters, the tool registry over
                        the server actions, the tool-calling runtime, and RAG over message history
src/components/chat     The assistant panel (assistant-ui): runtime adapter, launcher, tool card
src/data                Example books, validation, the Postgres-or-example loader, sync policy, and valuation
src/adapters/market     Keyless price (CoinGecko) and FX (ECB) providers
src/app/api             Route handlers: the scheduled cron pass and the signed webhook receiver
drizzle                 SQL migrations
docs                    Decisions, including docs/adr-{solana,evm,bitcoin,sui}-data-source.md and docs/adr-scheduled-ingestion.md
```

Journal amounts are bigint minor units (sen, cents, wei, lamports). `postJournalEntry` rejects an entry unless it has at least two lines and debits equal credits in a single functional currency. Measurement-basis labels on the sample chart (IAS 38, IAS 2, IFRS 9) are illustrations, not accounting advice.
