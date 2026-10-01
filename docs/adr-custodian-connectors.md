# ADR: Custodian connectors and first provider (Fireblocks)

Status: accepted
Applies to: issue #57 (`Sub-epic: Custodian connectors` → `Choose the first custodian provider and vault model`) and #10 (`Implement first read-only custodian connector`).

## Decision

Build custodian connectors one provider at a time behind the existing
`CustodianSourceAdapter` port. The **first provider is Fireblocks**, read-only,
via its REST API using a user-supplied **API key and RSA private key** with a
read-only role.

Target providers, in order: **Fireblocks, Copper, BitGo, Anchorage**. Each is a
separate connector behind the `CustodianSourceAdapter` port, sharing the
credential store and the frontend consent flow used by exchanges (#13, #94).

## Read-only credential model

Fireblocks API users carry a **role** (the same roles as Console users). A
connector API user is created with the **Viewer** role, which can read vault
accounts, balances, and transactions and cannot initiate or sign a transaction.
A Viewer API user is the read-only guarantee: even a bug cannot move funds.

Authentication is a **JWT signed with RS256**:

- The user generates an RSA 4096 key and CSR, and uploads the CSR in the
  Fireblocks Console to obtain an API key.
- Each request carries `X-API-Key` and `Authorization: Bearer <JWT>`, where the
  JWT payload has `uri`, `nonce`, `iat`, `exp` (< 30s), `sub` (the API key), and
  `bodyHash` (hex SHA-256 of the empty body for a GET), signed with the private
  key using RS256.

The API key and the RSA private key are sealed with AES-256-GCM under
`CONNECTOR_ENCRYPTION_KEY` (#13) and never returned to the browser.

## Vault model

Fireblocks models custody as **vault accounts**, each holding **vault wallets**,
one per asset. A vault wallet is identified by the pair `(vaultAccountId,
assetId)`, and Fireblocks reports the on-chain network as the asset's
`blockchain`/`network` (for example `ETH`, `SOL`, `BTC`, or an ERC-20 asset with
its own id). This maps cleanly onto the ledger:

- A **connection** is one Fireblocks workspace (one API key).
- A **source** is one vault account, identified by its numeric vault account id.
- A **balance** is a vault wallet: asset, total, available, and the network when
  Fireblocks reports one. Some assets have no network (for example a fiat-like
  balance); those are supported with a null network, as the port already allows.

## Why Fireblocks first

- **Role-based read-only.** The Viewer role is a real guarantee, matching the
  Kraken model.
- **Reachable and testable.** The API is reachable (`api.fireblocks.io` returns a
  typed unauthorized error without a key) and there is a free developer sandbox.
- **Institutional standard.** Fireblocks is widely used and its vault/transaction
  model is the reference for programmatic custody.
- **Well-specified shapes.** The OpenAPI spec publishes `VaultAsset` and
  `Transaction` schemas, so the mapping is exact rather than guessed.

## Endpoints used (Fireblocks)

- `GET /v1/vault/accounts_paged` — list vault accounts (Viewer)
- `GET /v1/vault/assets` — asset balance across accounts (Viewer)
- `GET /v1/vault/accounts/{vaultAccountId}/{assetId}` — one vault wallet (Viewer)
- `GET /v1/transactions` — transactions with `after`/`before` cursor (Viewer)

No endpoint that creates, signs, or broadcasts a transaction is ever called.

## Providers compared

| Provider | Read-only role/key | Auth | Notes |
| --- | --- | --- | --- |
| **Fireblocks** (chosen) | Viewer role | JWT RS256 | Free sandbox; published OpenAPI spec |
| Copper | View-only user | API key + HMAC | Institutional; onboarding-gated |
| BitGo | View wallet permission | Access token + HMAC | Test env; wallet-scoped |
| Anchorage | Read-only key | API key | Institutional; onboarding-gated |

## Consequences

- Custodian connectors reuse the credential store (#13) and consent flow (#94);
  Fireblocks needs an RSA key rather than a secret string, so the stored secret
  is the PEM private key, sealed like any other.
- Fireblocks vault wallets carry a network per asset; the mapping keeps it and
  leaves it null when absent.
- Adding Copper, BitGo, or Anchorage later is one connector plus a registry entry,
  the same pattern as exchanges.

## References

- Fireblocks API authentication (JWT RS256): https://developers.fireblocks.com/reference/signing-a-request-jwt-structure
- Fireblocks API key management and roles: https://developers.fireblocks.com/docs/manage-api-keys
- Fireblocks vaults: https://developers.fireblocks.com/_llms/api/api-endpoints/vaults.md
- Fireblocks OpenAPI spec: https://swagger.fireblocks.com/openapi.yaml
