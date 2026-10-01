# ADR: Exchange connectors and first venue (Kraken)

Status: accepted
Applies to: issue #55 (`Sub-epic: Exchange connectors` → `Choose the first exchange and its read-only credential model`) and #9 (`Implement first read-only exchange connector`).

## Decision

Build exchange connectors one venue at a time behind a shared framework. Each venue supplies a read-only connector (balances, deposits, withdrawals, and trades where available) that implements one `VenueConnector` interface, and the generic `VenueExchangeAdapter` exposes it through the `ExchangeSourceAdapter` port. A user-supplied credential is stored sealed at rest (see #13).

Venues: **Kraken, Bybit, Binance, Gate.io, Backpack**.

| Venue | Auth | Read-only scopes |
| --- | --- | --- |
| Kraken | HMAC-SHA512 | Query Funds, Query Ledger Entries, Query Closed Orders & Trades |
| Bybit | HMAC-SHA256 | Read-Only / Wallet (read) |
| Binance | HMAC-SHA256 | Enable Reading |
| Gate.io | HMAC-SHA512 | Spot account read, Wallet read |
| Backpack | ED25519 | Read-only API key |

Each venue's client only calls read endpoints; no order, cancel, or withdraw path exists in any connector, and tests assert no request URL matches a write route.

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
