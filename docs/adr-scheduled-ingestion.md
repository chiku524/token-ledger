# ADR: Scheduled ingestion, sync history, and event ingestion

Status: accepted. Epic #75, sub-epics #76–#79.

## Context

Until now a connection only refreshed when a user clicked Check. That left three
gaps: balances and movements went stale between clicks, a pull left no history,
and sources that can push had no way in. This ADR records how scheduled pulls,
run history, and signed webhooks are built.

## Decision

### One sync path

Every pull — a manual Check, a scheduled run, a CLI run, a webhook follow-up —
goes through `runConnectionSync` in `src/data/run-sync.ts`. It is read-only: it
pulls balances and movements, stores observations, and never posts a journal.
Callers differ only in the `trigger` they record.

### Schedule and backoff

`src/data/sync-schedule.ts` holds the policy as pure functions:

- A healthy connection is due every `DEFAULT_SYNC_INTERVAL_MS` (15 minutes).
- After consecutive failures the wait grows through `SYNC_BACKOFF_MS`
  (0, 5m, 30m, 2h, 6h). The failure count is read from sync history, so it
  survives a restart.
- On a failure the connection stores `next_attempt_at`; a success clears it.
  A manual run ignores the backoff.

Vercel Cron calls `GET /api/cron/sync` on the same 15-minute schedule
(`vercel.json`). The route is guarded by `CRON_SECRET` as a bearer token when
that variable is set; Vercel sends it automatically. The pass is a no-op without
`DATABASE_URL`, so a demo deploy stays quiet. `pnpm sync:run` runs the same pass
locally, for one organization or all of them.

Backoff changes the connection's status through the existing
`statusAfterSyncFailure`: a first failure stays `pending`, a failure after a
success becomes `degraded`. Both are surfaced on the operations view.

### Run history

`sync_runs` records one row per attempt: start and finish, status, trigger,
counts, and the error. `sync_run_payloads` keeps the raw adapter output as JSONB
with `quantityMinor` as decimal strings. Payloads are large, so retention is a
rolling window of the most recent `RAW_PAYLOAD_RUN_RETENTION` (20) runs per
connection; the run row itself is always kept. The operations view reads the last
run per connection in one query and orders failing connections first.

### Signed events

`POST /api/webhooks/source` accepts a JSON event signed with an HMAC. The scheme
is Stripe-like so it is familiar and easy to verify:

```
X-Token-Ledger-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
X-Token-Ledger-Delivery:  <opaque delivery id>        (optional)
signed payload:           ${t}.${raw body}
```

The signing secret is derived per source from `WEBHOOK_SIGNING_SECRET`
(`deriveSourceSecret`), so one leaked source secret cannot sign for another. A
timestamp outside a five-minute window is rejected, which bounds replay of a
captured request. The event is normalized into a source transaction; the unique
`(source_id, external_id)` key on `webhook_events`, and again on
`source_transactions`, makes a redelivery a no-op that is acknowledged with
`200 duplicate`.

Ingestion queues a `match_jobs` row rather than matching inline. The webhook
response stays fast, and the same queue can back a later worker once matching is
moved off the request path.

## Consequences

- A pull no longer needs a click, and every pull is auditable.
- A rate-limited venue is not hammered: consecutive failures back off.
- A source can push an event; the signature, not a session, authorises it.
- Payload retention is bounded, so `sync_run_payloads` cannot grow without limit.
- The scheduler is an HTTP route, so it also works on any host that can call it
  with the bearer token, not only Vercel Cron.

## Not done

- The `match_jobs` queue is recorded but no worker drains it yet. Matching still
  runs on the next books load, exactly as before. A worker is a follow-up.
- A source webhook secret is derived, not individually rotated. Per-source
  rotation is a follow-up.
