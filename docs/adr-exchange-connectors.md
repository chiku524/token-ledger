# ADR: Exchange connectors and first venue (Kraken)

Status: accepted
Applies to: issue #55 (`Sub-epic: Exchange connectors` → `Choose the first exchange and its read-only credential model`) and #9 (`Implement first read-only exchange connector`).

## Decision

Build exchange connectors one venue at a time. The **first venue is Kraken**, read-only, via its REST API using a user-supplied **read-only API key** stored sealed at rest (see #13).

Target exchanges, in order: **Kraken, Bybit, Binance, Gate.io, Backpack**. Each is a separate adapter behind the existing `ExchangeSourceAdapter` port.

## Read-only credential model

Kraken API keys carry granular permissions. A connector key is created with **only**:

- **Query Funds** — read balances
- **Query Ledger Entries** — read deposits, withdrawals, and transfers
- **Query Closed Orders & Trades** — read trades

and with **Create & Modify Orders** and **Withdraw Funds** left **off**. This makes read-only a property of the key, not a promise in code: even a bug cannot move funds.

Authentication is HMAC-SHA512:

```
API-Sign = base64( HMAC-SHA512( base64decode(apiSecret),
             urlPath + SHA256( nonce + postData ) ) )
```

with `API-Key` and `API-Sign` headers and a monotonically increasing `nonce` in the form body.

The key and secret are entered by the user through the frontend flow (#94), sealed with AES-256-GCM under `CONNECTOR_ENCRYPTION_KEY` (#13), and never returned to the browser.

## Why Kraken first

- **Granular read-only permissions.** A real guarantee, unlike venues where a key is all-or-nothing.
- **Simple, well-documented HMAC auth.** No JWT/ECDSA dance.
- **Asset metadata is public.** `GET /0/public/Assets` returns per-asset `decimals`, so balances can be mapped to minor units without guessing.
- **Keyless spike works.** Public endpoints respond without a key; private endpoints reject a missing key with `EAPI:Invalid key`.

## Venue comparison

| Venue | Read-only key? | Auth | Notes |
| --- | --- | --- | --- |
| **Kraken** (chosen first) | Granular permissions | HMAC-SHA512 | Public asset metadata incl. decimals |
| Bybit | Yes (read-only key type) | HMAC-SHA256 | Region restrictions vary |
| Binance | Yes (permissions) | HMAC-SHA256 | Regional/key-type constraints; heavier compliance |
| Gate.io | Yes (permissions) | HMAC-SHA512 | Similar HMAC model |
| Backpack | Key-based | Ed25519 signing | Different signing model; verify read-only scopes |

## Endpoints used (Kraken)

- `GET  /0/public/Assets` — symbol and decimals (no auth)
- `POST /0/private/Balance` — balances (Query Funds)
- `POST /0/private/Ledgers` — deposits, withdrawals, transfers (Query Ledger Entries)
- `POST /0/private/TradesHistory` — trades (Query Closed Orders & Trades)

`AddOrder`, `CancelOrder`, and `Withdraw` are never called.

## Consequences

- Exchange connectors are the first source that stores a secret; the credential path (#13, #94) is a prerequisite and is shared by every venue.
- Kraken's legacy symbol prefixes (`ZUSD`, `XXBT`) appear in responses; the adapter normalizes these (strip a leading `X`/`Z` where it denotes a currency prefix) and prefers `altname` from `/Assets`.
- Rate limits are per-key (the private call counter); the reader must respect it and surface 429/`EAPI:Rate limit exceeded`.
- Additional venues reuse the same credential store, the same consent flow, and the same normalized types.

## References

- Kraken REST API: https://docs.kraken.com/api/docs/rest-api/get-account-balance
- Kraken API key permissions: https://support.kraken.com/hc/en-us/articles/360000919966
- Authenticated requests (HMAC-SHA512): https://docs.kraken.com/api/docs/guides/global-authentication
