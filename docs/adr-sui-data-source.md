# ADR: Sui data source

Status: accepted
Applies to: issue #52 (`Sub-epic: Sui` → `Evaluate and choose a free Sui data source`) and #53 (`Implement Sui chain reader`).

## Decision

Implement the Sui connector against the **Sui GraphQL RPC**, using the free, keyless public endpoint at `https://graphql.mainnet.sui.io/graphql`. Allow an override with `SUI_RPC_URL` for a provider endpoint.

The adapter is read-only, never signs, and needs no key.

## Why

- **JSON-RPC is being removed.** Sui Foundation **disabled JSON-RPC on its public mainnet full nodes** the week of July 27, 2026, and plans full code removal mid-October 2026. Building on JSON-RPC would mean shipping a connector already at end of life.
- **GraphQL is the documented replacement** for exactly this use: balances and transaction history. It is free and keyless, matching the product's no-secret rule, and it removes the Sui dependency on a paid key.
- **One query per need.** `address.balances` returns all coin balances in one call (replacing `suix_getAllBalances`), and `address.transactions { effects { balanceChanges } }` returns dated, signed balance changes (replacing `suix_queryTransactionBlocks` with `showBalanceChanges`).
- **Spike-verified.** Balances and transactions were returned live for mainnet addresses, including per-transaction `timestamp` and signed `balanceChanges`, with no key.

## Options considered

| Option | Free tier | Key | Coverage | Notes |
| --- | --- | --- | --- | --- |
| **Sui GraphQL RPC** (chosen) | Free, public | No | Balances, objects, transactions, events | The documented replacement for JSON-RPC |
| Sui JSON-RPC (Alchemy) | 30M CU/mo (shared) | Yes | Full JSON-RPC surface | Works today, but deprecated upstream and dated for removal |
| Sui public JSON-RPC fullnode | — | — | — | **Disabled** for mainnet (week of July 27, 2026) |
| Sui gRPC (full node / archival) | Provider-dependent | Usually | Streaming + point lookups | Built for pipelines, heavier for a read-only reader |

Rate-limit notes (retrieved for #52): the public GraphQL endpoint is rate-limited and intended for development/public-good use; a provider or self-hosted node is the production path.

## Consequences

- The connector is keyless, which matches the schema's "no API key" rule and removes the Sui dependency on any paid provider.
- One non-obvious detail: GraphQL returns coin types with the package id **zero-padded to 64 hex characters** (`0x0000…0002::sui::SUI`), while canonical Sui uses the short form (`0x2::sui::SUI`). The coin registry canonicalizes package ids so a coin matches either form. This is unit tested.
- Sui's `balanceChanges` cover every owner in a transaction, so the mapper scopes to the watched address via `balanceChange.owner.address`.
- History uses GraphQL cursor pagination (`last`, `before`), which the reader walks until the window is covered.
- No follow-up migration is required; this is the migration.

## References

- Sui JSON-RPC migration guide: https://docs.sui.io/develop/accessing-data/json-rpc-migration
- Sui GraphQL RPC: https://docs.sui.io/develop/accessing-data/graphql/graphql-rpc
- Sui gRPC: https://docs.sui.io/develop/accessing-data/grpc
