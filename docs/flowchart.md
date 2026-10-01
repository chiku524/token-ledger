# Token Ledger — flow charts

End-to-end flows through the system. Diagrams are Mermaid; GitHub renders them
inline. The guiding rule throughout: **reads are observations, writes to the
books are deliberate, and nothing pulled from a source ever posts a journal.**

---

## 1. System at a glance

```mermaid
flowchart LR
  subgraph Sources["Read-only sources"]
    CH["Chains<br/>Ethereum · Solana · Polygon · Bitcoin · Sui"]
    EX["Exchanges<br/>Kraken · Bybit · Binance · Gate · Backpack"]
    CU["Custodians<br/>Fireblocks · BitGo"]
  end

  subgraph Ingestion
    SYNC["runConnectionSync<br/>manual · scheduled · cli"]
    HOOK["POST /api/webhooks/source<br/>signed push events"]
  end

  subgraph Ledger["Double-entry books"]
    JRN["Journal entries<br/>post · reverse"]
    REC["Reconciliation<br/>source facts ↔ ledger movements"]
  end

  subgraph Output
    REP["Reports<br/>trial balance · journal · CSV"]
    CON["Consolidation<br/>multi-entity + FX"]
    AUD["Audit trail<br/>audit_events · sync_runs"]
  end

  CH --> SYNC
  EX --> SYNC
  CU --> SYNC
  SYNC -->|"balances + movements (observations)"| REC
  SYNC --> AUD
  HOOK -->|"source transactions + match job"| REC
  HOOK --> AUD
  JRN --> REC
  JRN --> REP
  JRN --> CON
  REC --> REP
  REC --> AUD
```

---

## 2. Authentication and session

```mermaid
flowchart TD
  A["Visitor"] --> B{"DATABASE_URL set?"}
  B -- "no" --> C["Demo mode<br/>sign-in page offers role preview"]
  C --> C1["signDemoToken → tl_demo cookie"]
  C1 --> DASH
  B -- "yes" --> D["/sign-in or /sign-up"]
  D --> E{"Which path?"}
  E -- "sign-up" --> F["parseSignup → registerOrganization<br/>hashPassword (PBKDF2)"]
  F --> G["createSession → tl_session cookie"]
  E -- "password" --> H["authenticate<br/>verifyPassword + lockout check"]
  H --> G
  E -- "invite" --> I["consumeInvite + hashPassword"]
  I --> G
  G --> J["proxy.ts<br/>dashboard requires session"]
  J --> DASH["/dashboard"]
  DASH --> K["getSession() → SessionUser"]
  K --> L["requirePermission(permission)<br/>RBAC matrix + entity scope"]
  L --> M["Action or page renders"]
```

Notes: the signed-in identity is isolated in `getSession()`; swapping in
Privy/Crossmint would only change how a `SessionUser` is produced. RBAC and
entity scoping stay.

---

## 3. Adding a connection and syncing

```mermaid
flowchart TD
  A["User adds a wallet / exchange / custodian"] --> B["createConnectionAction"]
  B --> C{"mode"}
  C -- "watch" --> D["chain key must be in WATCH_VENUES<br/>ethereum · solana · polygon · bitcoin · sui"]
  C -- "exchange_read" --> E["credential checked by a real<br/>read-only call, then sealed (AES-256-GCM)"]
  C -- "custodian_read" --> F["viewer credential verified, then sealed"]
  D --> G["connectionFromForm → insertConnection"]
  E --> G
  F --> G
  G --> H["connection status: pending (or healthy if verified)"]

  H --> I{"How is the pull triggered?"}
  I -- "manual" --> J["refreshConnectionAction<br/>trigger: manual"]
  I -- "scheduled" --> K["GET /api/cron/sync<br/>trigger: scheduled (interval + backoff)"]
  I -- "cli" --> L["pnpm sync:run<br/>trigger: cli"]
  I -. "push instead of poll" .-> M["POST /api/webhooks/source<br/>see section 4"]

  J --> N["runConnectionSync"]
  K --> N
  L --> N
  N --> O["adapterForConnection<br/>resolve per venue"]
  O --> P["pullReadOnly → fetchBalances + fetchTransactions"]
  P --> Q{"Result"}
  Q -- "success" --> R["recordSyncSuccess<br/>balance_snapshots + source_transactions<br/>cursor advanced, status healthy"]
  Q -- "not live / failed" --> S["recordSyncFailure<br/>status degraded (first failure stays pending)<br/>backoff via next_attempt_at"]
  R --> T["finishSyncRun: status ok + counts"]
  S --> U["finishSyncRun: failed / not_live + error"]
  T --> V["sync_runs history + raw payloads (rolling retention)"]
  U --> V
  R --> W["audit_events: connection.synced"]
```

Key point: `recordSyncSuccess` writes **observations only** — balances and source
transactions. It never inserts a journal entry.

---

## 4. Signed event ingestion (webhooks)

```mermaid
flowchart TD
  A["Source pushes JSON event"] --> B["POST /api/webhooks/source"]
  B --> C{"WEBHOOK_SIGNING_SECRET set?"}
  C -- "no" --> C1["503 not configured"]
  C -- "yes" --> D["parse JSON, read sourceId"]
  D --> E["findWebhookSource → resolve source + assets"]
  E --> F["verifyWebhookSignature<br/>HMAC over t.rawBody, per-source secret"]
  F --> G{"Valid + within 5 min?"}
  G -- "no" --> G1["401 rejected"]
  G -- "yes" --> H["normalizeWebhookEvent<br/>validate asset, date, direction, quantity"]
  H --> I["recordWebhookIngest (transaction)"]
  I --> J{"source+external_id<br/>already seen?"}
  J -- "yes" --> J1["200 duplicate (no-op)"]
  J -- "no" --> K["insert webhook_events"]
  K --> L["insert source_transactions<br/>(idempotent on source+external id)"]
  L --> M["enqueue match_jobs (queued)"]
  M --> N["audit_events: source_transactions.received"]
  N --> O["202 accepted"]
```

---

## 5. Posting to the books and reconciling

```mermaid
flowchart TD
  A["Accountant reviews observed activity<br/>/dashboard/sources + /dashboard/reconciliation"] --> B["Post a journal entry<br/>/dashboard/ledger"]
  B --> C["postJournalEntry<br/>≥2 lines, debits = credits"]
  C --> D["insertJournal → journal_entries + journal_lines"]
  D --> E["audit_events: journal.posted"]
  E --> F["Posted entries are immutable"]
  F --> G{"Wrong entry?"}
  G -- "yes" --> H["insertReversal<br/>reverseJournalEntry"]
  H --> I["audit_events: journal.reversed"]

  D --> J["buildReconciliations<br/>match source facts ↔ ledger movements"]
  J --> K{"Matched?"}
  K -- "yes" --> L["status matched"]
  K -- "no" --> M["status exception<br/>(manual match UI not built yet — epic #66)"]
```

The separation is deliberate: pulls create **observed** facts; journals create
**booked** value; reconciliation proves the two agree. That is the audit trail.

---

## 6. Reporting, consolidation, and audit

```mermaid
flowchart LR
  A["Booked journals"] --> B["trialBalance / netBalanceMinor<br/>/dashboard/reports"]
  A --> C["assetCarryingSchedule"]
  A --> D["Consolidation<br/>/dashboard/consolidation"]
  E["Stored FX rates<br/>fx_rates"] --> D
  D --> F["translate entities → combined trial balance"]
  B --> G["CSV export<br/>/dashboard/reports/export"]
  C --> G
  A --> H["Audit log<br/>/dashboard/audit"]
  I["sync_runs"] --> J["Operations view<br/>/dashboard/operations"]
  H --> G
```

---

## 7. Deployment targets

```mermaid
flowchart TD
  A["Repo"] --> B["Vercel (default/supported)<br/>vercel.json cron → /api/cron/sync"]
  A --> C["Cloudflare Workers (optional, #98)<br/>wrangler.jsonc + Web Crypto crypto<br/>needs Hyperdrive/HTTP DB driver"]
  A --> D["Container (optional, #100)<br/>Dockerfile + deploy/akash.yaml<br/>DEPLOY_TARGET=container"]
  B --> E["Postgres (DATABASE_URL)"]
  C --> E
  D --> E
```

---

## 8. The one-sentence summary

A user signs in, connects read-only sources across chains/exchanges/custodians,
records what they hold, then deliberately journals and reconciles it — while
every pull, event, post, and reversal is written to an auditable history.
