# ADR: Accounting sync (Xero, QuickBooks, ERP)

Status: accepted
Applies to: issue #58 (`Sub-epic: Accounting sync`) and its tasks #59 (Xero), #60 (QuickBooks), #61 (generic ERP port).

## Decision

Push posted, already-balanced ledger entries to external accounting systems
through the existing `AccountingSyncAdapter` port. Three connectors are
implemented:

- **Xero** — POSTED manual journals, one request per entry, `Idempotency-Key` per entry.
- **QuickBooks Online** — JournalEntry objects, one request per entry, `requestid` per entry.
- **Generic ERP** — a documented port (`ErpClient`) plus an in-memory reference
  adapter, so a new system plugs in without touching the ledger.

This is the **first write path** in the product. Everything else (chains,
exchanges, custodians) is read-only; this one creates records in another system,
so idempotency is a correctness requirement, not a nicety.

## Auth

OAuth 2.0 authorization code, client-side only (the tokens are stored sealed):

- **Xero:** `https://login.xero.com/identity/connect/authorize`, token at
  `https://identity.xero.com/connect/token`. Scopes: `offline_access`,
  `accounting.settings.read`, `accounting.transactions`. Requests carry
  `Authorization: Bearer` and `Xero-tenant-id` (from `/connections`).
- **QuickBooks:** `https://appcenter.intuit.com/connect/oauth2`, token at
  `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`. Scope:
  `com.intuit.quickbooks.accounting`. Requests carry `Authorization: Bearer`
  and the realm (company) id in the path. Sandbox base:
  `https://sandbox-quickbooks.api.intuit.com/v3/company`.

Tokens are short-lived and refreshable; the client module builds URLs and
exchanges tokens only, and the caller stores them sealed (see #13).

## Idempotency

Both Xero and QuickBooks accept a client-supplied idempotency key. The key is
derived deterministically from the ledger reference:
`token-ledger-<reference>` (sanitised, max 64 chars). A retry of the same entry
reuses the key, so it cannot create a duplicate:

- Xero: `Idempotency-Key` request header.
- QuickBooks: `requestid` query parameter.
- ERP: the `ErpClient.findByKey` check before `create`.

## Mapping

- **Xero ManualJournal:** `LineAmount` is **signed** (debit positive, credit
  negative), `LineAmountTypes: NoTax`, `Status: POSTED`. One journal per posted
  entry, keyed by its reference.
- **QuickBooks JournalEntry:** `Amount` is positive with
  `JournalEntryLineDetail.PostingType` of `Debit` or `Credit`. A ledger account
  code maps to a QBO `AccountRef`; the default uses the code as the name, and
  the adapter accepts an `accountRef` mapper for a real chart of accounts.
- Amounts are converted from bigint minor units to major-unit strings exactly.

## Why this shape

- One **port**, three implementations: a new ERP is an `ErpClient` plus a
  registry entry, and the ledger does not change (#61's "Done when").
- **Idempotent by construction.** The key lives with the entry reference, so it
  is stable across retries, processes, and deploys.
- **Test seams** (`post` on Xero and QuickBooks, `client` on ERP) let the suite
  prove the mapping and idempotency with no network and no OAuth app.

## Consequences

- OAuth app registration for Xero and QuickBooks is required to run live; the
  connectors are built and unit-tested without it. Live pushes are the
  remaining verification, and need client ids/secrets.
- The generic ERP adapter defaults to an in-memory reference client, which is
  not a real ledger; its descriptor says so, and a real client is configured
  for production.
- This is the only write path; the read-only contract (#11) does not apply to
  it, and its own tests cover mapping, idempotency, and error handling.

## References

- Xero OAuth 2.0 and manual journals: https://developer.xero.com/documentation/guides/oauth2/auth-flow/, https://developer.xero.com/documentation/api/accounting/manualjournals/
- Xero OpenAPI: https://github.com/XeroAPI/Xero-OpenAPI
- QuickBooks OAuth and journal entries: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization, https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/journalentry
