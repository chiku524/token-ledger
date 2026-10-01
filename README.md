# Token Ledger

Accounting and financial-data layer for digital assets. Token Ledger consolidates a company's crypto — hot wallets, cold wallets, staking positions, custodians, and exchanges, across chains such as Ethereum, Solana, and Polygon — into one double-entry subledger.

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

## Database

Optional until you want to record entities, sources, journals, reversals, or a CSV import. The forms stay read-only when `DATABASE_URL` is unset.

```bash
cp .env.example .env
# edit DATABASE_URL — postgres:// or postgresql://
pnpm db:migrate
pnpm db:seed
```

`DATABASE_URL` is optional. If it is set, it must be a Postgres URL. `AUTH_SECRET` is required for password sessions and must be at least 32 characters. `db:generate` writes a new SQL migration from `src/db/schema.ts` and does not need a running database. `db:seed` reloads the Harbourline example organization, including its example FX rate, audit events, and fictional users, and replaces that organization's previous rows. It does not delete other organizations. Reloading the example is the one path that deletes posted journals, and it sets a transaction-local flag the immutability trigger recognizes.

Posted journals and the audit log reject updates. A wrong journal is corrected by posting a reversal. The actor on a new posting is the signed-in user.

## Authentication and roles

Sign-in is a database session. Passwords are hashed with scrypt (N=16384, r=8, p=1). The session cookie `tl_session` is httpOnly, SameSite=Lax, and a 12-hour token. Only a hash of that token, bound to `AUTH_SECRET`, is stored. Mutations also require a CSRF cookie that matches the form, and an Origin host that matches this app. Five failed sign-ins for an email within 15 minutes lock further attempts until the window ages out. A new organization starts at `/sign-up`. The wizard can connect a wallet, an exchange, a custodian, or any combination. Those connections are managed later in Settings. No API key is stored.

Create the first owner after the database has an organization:

```bash
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET, BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD (12+ characters)
pnpm db:migrate
pnpm db:seed
pnpm auth:bootstrap
```

`pnpm auth:bootstrap` refuses to add another owner when an active owner already exists. Owners and admins then invite people from **Users**. The invite link is shown once in the page and is not emailed. It expires in 7 days. The invited person sets a password at `/sign-in?invite=...`. An owner or admin is then asked, step by step, to connect a wallet, an exchange, and a custodian. Each step can be skipped.

| Role | Books | Export and audit | Journals, reversals, CSV import | Entities, sources, FX | Users |
| --- | --- | --- | --- | --- | --- |
| Owner | Read | Yes | Yes | Yes | Everyone, including owners |
| Admin | Read | Yes | Yes | Yes | Everyone except owners |
| Accountant | Read | Yes | Yes | No | No |
| Viewer | Read | Yes | No | No | No |

An empty entity scope means every entity. A comma-separated scope limits accountants and viewers to those entities. Owners and admins are not narrowed by scope. The audit log stays organization-wide. The last active owner cannot be demoted or deactivated. Nobody can deactivate themselves or change their own role.

Demo sign-in is only for the example books: it is allowed when `DATABASE_URL` is unset, `NODE_ENV` is not `production`, and `VERCEL_ENV` is not `production`. A configured database never accepts a demo cookie. Pick a role on the sign-in page to preview permissions. Nothing is saved.

`pnpm db:seed` also creates these fictional local-dev users. The passwords are not for production.

| Email | Role | Password | Scope |
| --- | --- | --- | --- |
| owner@harbourline.example | Owner | Harbourline-owner-1 | All entities |
| admin@harbourline.example | Admin | Harbourline-admin-1 | All entities |
| accountant@harbourline.example | Accountant | Harbourline-accountant-1 | All entities |
| viewer@harbourline.example | Viewer | Harbourline-viewer-1 | All entities |
| viewer.sg@harbourline.example | Viewer | Harbourline-viewer-sg-1 | Singapore entity only |

Harbourline stores one example rate, 1 MYR = 0.3000 SGD. SGD amounts use the exact inverse (10/3), which is not a second stored rate.

An approver role that must approve a journal before it posts is not in this build. Reconciliation still has no separate match or unmatch action; importing source facts and posting journals is what feeds it. There is no email delivery and no live FX feed.

Environment variables:

- `DATABASE_URL` — optional Postgres URL. Unset means example books and demo sign-in.
- `AUTH_SECRET` — required for password sessions, at least 32 characters.
- `CONNECTOR_ENCRYPTION_KEY` — required to store exchange credentials, at least 32 characters, server-only. Derives the AES-256-GCM key that seals secrets at rest.
- `KRAKEN_API_KEY`/`_SECRET`, `BYBIT_API_KEY`/`_SECRET`, `BINANCE_API_KEY`/`_SECRET`, `GATE_API_KEY`/`_SECRET`, `BACKPACK_API_KEY`/`_SECRET` — read-only keys used by `pnpm exchange:verify`. In the app a credential is entered by the user and stored sealed.
- `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_NAME`, `BOOTSTRAP_OWNER_PASSWORD` — used only by `pnpm auth:bootstrap`.
- `SOLANA_RPC_URL` — optional. A private Solana RPC endpoint. Unset uses the free, keyless public cluster (`https://api.mainnet-beta.solana.com`). Must be `https://` with no embedded credentials.
- `ALCHEMY_API_KEY` — optional. Unlocks EVM ERC-20 balances and transfers for Ethereum and Polygon. Unset falls back to a keyless public RPC for native balances only.
- `EVM_RPC_URL_ETHEREUM`, `EVM_RPC_URL_POLYGON` — optional per-chain EVM RPC overrides. `https://` only, no embedded credentials.
- `BITCOIN_ESPLORA_URL` — optional. A self-hosted Esplora instance or Blockstream. Unset uses the keyless mempool.space API. `https://` only, no embedded credentials.
- `SUI_RPC_URL` — optional. A Sui GraphQL endpoint. Unset uses the keyless public endpoint (`https://graphql.mainnet.sui.io/graphql`). Uses GraphQL because Sui Foundation removed JSON-RPC from its public nodes (see `docs/adr-sui-data-source.md`).

Verify a live chain read with `pnpm chain:verify [solana|ethereum|polygon|bitcoin|sui] [ADDRESS]`, a live exchange read with `pnpm exchange:verify [kraken|bybit|binance|gate|backpack]`, and a live custodian read with `pnpm custodian:verify [bitgo|fireblocks]` (needs a read-only token).

CSV import expects a header of `external_id,occurred_on,asset_code,direction,quantity,description`. Quantity is in major units. Import records source facts for reconciliation and does not post a journal.

Chain, custodian, Xero, and QuickBooks credentials are not stored. A connection stores an address or account id, the scopes `balances,movements`, a status, and a sync cursor. Exchange credentials are the one exception: a read-only API key and secret are entered by the user, sealed with AES-256-GCM under `CONNECTOR_ENCRYPTION_KEY`, and stored in `connection_credentials`. The plaintext never reaches the database and is never returned to the browser. The chain readers are live and read-only: they call JSON-RPC and never sign. Every other adapter in `src/adapters` throws before making a network call. Checking a connection records the outcome. It does not post a journal. Observed balances are separate from booked value.

Exchange connectors are live and read-only for Kraken, Bybit, Binance, Gate.io, and Backpack (see `docs/adr-exchange-connectors.md`). Custodian connectors are live and read-only for BitGo and Fireblocks (see `docs/adr-custodian-connectors.md`); a view-only token or Viewer API user cannot sign or move funds. A user authorises an exchange or custodian from the frontend: they enter a read-only credential, it is checked by a real read-only call, then sealed and stored. The chain readers return native and registered token balances as observed balances, and derive movements from the net change (Solana, Bitcoin) or balance changes (EVM, Sui) for a watched address. Sui reads through GraphQL, since JSON-RPC was removed from Sui's public nodes. Bitcoin has no token layer, so only BTC is modelled, and a transaction's change is cancelled by the net calculation. Unknown tokens are skipped rather than guessed; registries (`src/adapters/sources/solana/mints.ts`, `src/adapters/sources/evm/tokens.ts`) map well-known tokens to an asset code. See `docs/adr-solana-data-source.md`, `docs/adr-evm-data-source.md`, `docs/adr-bitcoin-data-source.md`, and `docs/adr-sui-data-source.md` for the endpoint choices and rate limits.

On Vercel, import this repo as a Next.js project. Set `DATABASE_URL` when you attach Postgres (Neon via the Vercel Marketplace is a straightforward fit). The example UI still renders if that variable is unset.

Report pages can download a trial balance, journal, or reconciliation CSV for the selected period. The export route is `/dashboard/reports/export`.

Posted entries can be pushed to an external accounting system: Xero (manual journals), QuickBooks Online (journal entries), or a generic ERP through the `AccountingSyncAdapter` port. Pushes are idempotent — a retry cannot create a duplicate. These are the only write path in the product and need OAuth app credentials to run live; see `docs/adr-accounting-sync.md`.

## Layout

```text
src/app                 Landing page, sign-in, and dashboard
src/auth                Passwords, sessions, roles, demo sign-in, and the owner bootstrap
src/proxy.ts            Sends unsigned visitors from /dashboard to /sign-in
src/ledger              Double-entry posting, reversals, FX, trial balance, reconciliation, CSV
src/db                  Drizzle schema, client, seed, read, and write
src/adapters            Source readers (chains, exchanges, custodians), a shared adapter contract
                        (contract-suite.ts), and accounting sync (Xero, QuickBooks, ERP)
src/data                Example books, validation, and the Postgres-or-example loader
drizzle                 SQL migrations
docs                    Decisions, including docs/adr-{solana,evm,bitcoin,sui}-data-source.md
```

Journal amounts are bigint minor units (sen, cents, wei, lamports). `postJournalEntry` rejects an entry unless it has at least two lines and debits equal credits in a single functional currency. Measurement-basis labels on the sample chart (IAS 38, IAS 2, IFRS 9) are illustrations, not accounting advice.
