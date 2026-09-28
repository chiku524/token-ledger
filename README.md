# Token Ledger

Accounting and financial-data layer for digital assets. Token Ledger consolidates a company's crypto — hot wallets, cold wallets, staking positions, custodians, and exchanges, across chains such as Ethereum, Solana, and Polygon — into one double-entry subledger.

The first markets are Malaysia and Singapore. The reporting frame is IFRS: an audit trail, reconciliation to every source, and journals that can sync to Xero, QuickBooks, and ERPs.

Planned tiers:

- **Startup** — Web3 startups and funds, quarterly reporting.
- **Institutional** — TradFi and scaling Web3 firms, monthly reporting, multi-entity consolidation, and asset valuation reporting.

Later: token treasury and lifecycle management for issuers, and an AI-assisted close. This repository is the foundation for that product, not the finished product. Connectors are stubs. The dashboard runs on fictional example books for Harbourline Digital.

## Stack

Next.js (App Router) and TypeScript, Postgres with Drizzle, pnpm. The app deploys on Vercel. The UI does not need a database: it reads the example books in process. Postgres is there for the schema, migrations, and seed.

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the product page and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the example books.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Database

Optional until you want rows in Postgres.

```bash
cp .env.example .env
# edit DATABASE_URL
pnpm db:migrate
pnpm db:seed
```

`db:generate` writes a new SQL migration from `src/db/schema.ts` and does not need a running database. `db:seed` reloads the Harbourline example organization and replaces its previous rows. It does not delete other organizations.

Do not add chain, exchange, custodian, Xero, or QuickBooks credentials. The adapters in `src/adapters` throw before making a network call.

On Vercel, import this repo as a Next.js project. Set `DATABASE_URL` when you attach Postgres (Neon via the Vercel Marketplace is a straightforward fit). The example UI still renders if that variable is unset.

## Layout

```text
src/app                 Landing page and dashboard shell
src/ledger              Double-entry posting, trial balance, reconciliation
src/db                  Drizzle schema, client, seed
src/adapters            Stub chain, exchange, custodian, Xero, QuickBooks, and ERP ports
src/data                Example books (fictional, passed through the ledger)
drizzle                 SQL migrations
```

Journal amounts are bigint minor units (sen, cents, wei, lamports). `postJournalEntry` rejects an entry unless it has at least two lines and debits equal credits in a single functional currency. Measurement-basis labels on the sample chart (IAS 38, IAS 2, IFRS 9) are illustrations, not accounting advice.
