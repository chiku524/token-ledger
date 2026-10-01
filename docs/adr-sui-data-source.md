# ADR: Sui data source

Status: accepted
Applies to: issue #52 (`Sub-epic: Sui` → `Evaluate and choose a free Sui data source`) and #53 (`Implement Sui chain reader`).

## Decision

Implement the Sui connector against **Sui JSON-RPC**, served by a managed provider (Alchemy, using the existing `ALCHEMY_API_KEY`), with the free keyless public **GraphQL RPC** endpoint available as an override via `SUI_RPC_URL`.

This is a deliberate, time-boxed choice. Sui Foundation has **deprecated JSON-RPC on its own full nodes** (disabled the week of July 27, 2026; full code removal mid-October 2026). Alchemy still serves the JSON-RPC interface, which keeps the reader consistent with the other chains (`getBalance`, `getAllBalances`, `queryTransactionBlocks`). The free public GraphQL endpoint (`https://graphql.mainnet.sui.io/graphql`) is keyless and works today; it is the migration target and the fallback if a provider drops JSON-RPC.

The adapter is read-only and never signs.

## Why

- **Consistency.** `suix_getAllBalances` and `suix_queryTransactionBlocks` (with balance changes) map cleanly onto the existing reader and normalized types, matching the EVM work.
- **Reuses an existing key.** Alchemy already serves Sui mainnet on the same key used for EVM, so no new credential.
- **Keyless fallback exists.** Sui's public GraphQL endpoint is free and keyless, so the connector is not tied to a paid key even though JSON-RPC itself is going away.
- **Spike-verified.** `suix_getAllBalances` and `suix_queryTransactionBlocks` (filtered by `FromAddress`, with `showBalanceChanges`) were called against Alchemy Sui mainnet and returned real data. The public GraphQL endpoint answered a `checkpoint` query keylessly.

## Options considered

| Option | Free tier | Key | Coverage | Notes |
| --- | --- | --- | --- | --- |
| **Alchemy Sui JSON-RPC** (chosen) | 30M CU/mo (shared) | Yes (existing) | Balances, coins, transaction blocks, balance changes | JSON-RPC is deprecated upstream; works today |
| Sui public GraphQL RPC | Free, keyless | No | Balances, objects, transactions, events | The migration target; GraphQL-only |
| Sui public JSON-RPC fullnode | — | — | — | **Disabled** for mainnet (week of July 27, 2026) |
| Sui gRPC (full node / archival) | Provider-dependent | Usually | Streaming + point lookups | The other migration path; heavier for a read-only reader |
| QuickNode / other providers | Paid/free tiers | Yes | RPC | Viable overrides via `SUI_RPC_URL` |

Rate-limit notes (retrieved for #52): Sui's public GraphQL endpoint is rate-limited and intended for development/public-good use; a provider or self-hosted node is the production path. The JSON-RPC interface is on a published decommission timeline on Sui Foundation nodes.

## Consequences

- Because JSON-RPC is deprecated, this reader is explicitly on a migration path. The transport is isolated behind the reader and `SUI_RPC_URL`, so switching to GraphQL (or gRPC) is contained and does not touch the mappers.
- A key is required for JSON-RPC today, but the free public GraphQL endpoint keeps a keyless path open.
- Sui's coin type is a fully-qualified string (`0x2::sui::SUI`, `0x…::usdc::USDC`); a coin-type registry maps known types to an asset code, and unknown types are skipped, exactly like the EVM token registry.
- A follow-up should move the connector to GraphQL before the JSON-RPC decommission completes. This is recorded here as a known, accepted risk rather than hidden.

## References

- Sui JSON-RPC migration guide: https://docs.sui.io/develop/accessing-data/json-rpc-migration
- Sui GraphQL RPC: https://docs.sui.io/develop/accessing-data/graphql/graphql-rpc
- Sui gRPC: https://docs.sui.io/develop/accessing-data/grpc
- Alchemy supported chains: https://www.alchemy.com/docs
