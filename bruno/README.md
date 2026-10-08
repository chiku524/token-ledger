# Bruno collection: Token Ledger API

Manual HTTP tests for the app's route handlers, for use with
[Bruno](https://www.usebruno.com/). Open this `bruno/` folder as a collection.

## Environments

Two environments ship: **local** (`http://localhost:3000`) and **production**
(`https://app.tokenledger.win`). Pick one in Bruno, then fill the variables:

| Variable | Where to get it |
| --- | --- |
| `sessionCookie` | Sign in to the dashboard, then DevTools → Application → Cookies → copy `tl_session`. |
| `csrfToken` | Same place, copy `tl_csrf`. It must match the cookie you send. |
| `cronSecret` | Your `CRON_SECRET` (leave blank to skip the bearer check locally). |
| `webhookSigningSecret` | Your `WEBHOOK_SIGNING_SECRET`. |
| `sourceId` | A real source id in the org (see `pnpm webhook:send` docs for one). |
| `assetCode` | An asset the org tracks (e.g. `USDC`). |

Never commit real secrets into an environment file; fill them locally, or use
Bruno's secret variables.

## Requests

- `api/chat.bru` — the assistant streaming route (`POST /api/chat`, NDJSON).
- `api/cron/*.bru` — the three scheduled passes (sync, indexer, worker).
- `api/webhooks/source.bru` — a signed source event; the pre-request script
  builds the body, signs that exact string, and stores both in the environment.
- `api/connect/exchange-callback.bru` — the exchange OAuth redirect (documented;
  not meaningfully replayable by hand).
- `dashboard/audit/export.bru` — the audit-log CSV export.
- `dashboard/reports/*.bru` — the trial balance / journal / reconciliation CSVs
  and the PDF report.

## Notes

- Export and chat routes authenticate by the `tl_session` cookie, not a bearer
  token. A read-only **demo** session only works when `DATABASE_URL` is unset
  and the environment is not production.
- The assistant routes return `503` when `AI_PROVIDER` is unset — that is the
  expected "assistant is off" state, not a failure.
- The webhook is signature-authenticated and needs no session. Bruno's script
  sandbox has no `node:crypto`, so `scripts/hmac-sha256.js` provides the HMAC the
  pre-request script needs; `src/test/bruno-webhook-signature.test.ts` checks it
  against `node:crypto` so it cannot drift from the server.

## Running from the CLI

With a dev server on `http://localhost:3000`:

```bash
cd bruno
npx @usebruno/cli run api/cron/sync.bru --env local
```

Run one request at a time; each file is a request. Fill the environment
variables first, or expect the auth-required requests to return 401/403, which
is the correct "not signed in" response.
