# ADR: Custodian connectors (BitGo, Fireblocks)

Status: accepted
Applies to: issue #57 (`Sub-epic: Custodian connectors` → `Choose the first custodian provider and vault model`) and #10 (`Implement first read-only custodian connector`).

## Decision

Build custodian connectors one provider at a time behind the existing
`CustodianSourceAdapter` port. Two are implemented, both read-only:

- **BitGo** — the first provider, chosen for its simpler bearer-token auth and
  ready test environment.
- **Fireblocks** — also implemented; JWT RS256 with a Viewer API user.

Later providers: Copper and Anchorage. Each is a separate connector behind the
port, sharing the credential store and the frontend consent flow used by
exchanges (#13, #94).

## BitGo (first)

- **Auth:** a bearer **access token** (`Authorization: Bearer <token>`). No CSR
  or RSA key. The token is created by a user with view permissions; a
  read-only token cannot sign or send.
- **Test environment:** `https://app.bitgo-test.com` (production is
  `https://www.bitgo.com`). Selected by base URL.
- **Balances:** `GET /api/v2/wallet/balances` returns every wallet balance
  across coins in one call. `balanceString`, `confirmedBalanceString`,
  `spendableBalanceString` are **base-unit integers as strings** (satoshis, wei),
  so they convert to bigint directly with no scaling.
- **Transfers:** `GET /api/v2/{coin}/wallet/{walletId}/transfer`, per coin and
  wallet, paginated by `prevId`. A transfer has a `type` (`receive`/`send`),
  a `date`, a `state`, and `entries`; change entries (`isChange`) are internal
  and not counted.
- **Coin keys:** `btc`, testnet `tbtc`, or a token `eth:usdc`. The ledger asset
  is the token symbol when present, otherwise the base symbol, with a testnet
  `t` prefix stripped. The network for a token is the base coin.

## Fireblocks (second)

- **Auth:** JWT signed with RS256 using the API user's RSA private key. Each
  request carries `X-API-Key` and `Authorization: Bearer <JWT>` with `uri`,
  `nonce`, `iat`, `exp` (< 30s), `sub`, and `bodyHash`.
- **Read-only:** a **Viewer** API user cannot sign or move funds.
- **Model:** a workspace of **vault accounts**, each holding **vault wallets**,
  one per asset. `VaultAsset.total` is the balance; the network is the asset's
  `blockchain` when present, else null.
- **Endpoints:** `/v1/vault/accounts_paged`, `/v1/vault/accounts/{id}`,
  `/v1/transactions`.

## Why a shared port

Both providers reduce to the same normalized shapes: observed balances (asset,
minor units, as-of) and movements (asset, in/out, minor units, date, external
id). The vault model differs — BitGo is coin/wallet keyed, Fireblocks is
vault-account keyed — but both fit `CustodianSourceAdapter` unchanged. A vault
with no network is supported with a null network, as the port allows.

## Endpoints used

**BitGo**
- `GET /api/v2/wallet/balances` — balances (view)
- `GET /api/v2/{coin}/wallet` — wallets for a coin (view)
- `GET /api/v2/{coin}/wallet/{walletId}/transfer` — transfers (view)

**Fireblocks**
- `GET /v1/vault/accounts_paged`, `GET /v1/vault/accounts/{id}`, `GET /v1/transactions` (Viewer)

No endpoint that creates, signs, or broadcasts a transaction is ever called.

## Providers compared

| Provider | Read-only access | Auth | Notes |
| --- | --- | --- | --- |
| **BitGo** (first) | View token | Bearer token | Instant test env; one-call balances; base-unit string balances |
| **Fireblocks** (second) | Viewer role | JWT RS256 | Free sandbox; CSR + RSA key required |
| Copper | View-only user | API key + HMAC | Institutional; onboarding-gated |
| Anchorage | Read-only key | API key | Institutional; onboarding-gated |

## Consequences

- Custodian connectors reuse the credential store (#13) and consent flow (#94).
  BitGo stores the access token as the `apiKey`; Fireblocks stores the API key as
  `apiKey` and the RSA private key PEM as `apiSecret`.
- BitGo balances are base-unit strings, unlike exchanges (major units with
  decimals); the BitGo mapper converts them directly.
- Adding Copper or Anchorage later is one connector plus a registry entry, the
  same pattern as exchanges.

## References

- BitGo REST API: https://developers.bitgo.com/reference/overview
- BitGo environments: https://developers.bitgo.com/docs/get-started-environments
- Fireblocks API authentication (JWT RS256): https://developers.fireblocks.com/reference/signing-a-request-jwt-structure
- Fireblocks API key management and roles: https://developers.fireblocks.com/docs/manage-api-keys
