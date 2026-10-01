# ADR: EVM data source (Ethereum, Polygon)

Status: accepted
Applies to: issue #43 (`Sub-epic: EVM chains` → `Evaluate and choose a free EVM data source`) and #7 (`Implement EVM chain reader for Ethereum and Polygon`).

## Decision

Implement the EVM connector against the **standard Ethereum JSON-RPC interface plus Alchemy's enhanced methods**, using Alchemy as the primary source across chains.

- Native balance: `eth_getBalance` (standard).
- ERC-20 balances: `alchemy_getTokenBalances` (enhanced; one call for many tokens).
- Transfers: `alchemy_getAssetTransfers` (enhanced; returns normal, internal, and ERC-20 transfers with a block-time `metadata`, so it works for reconciliation).
- Fallback: a keyless public RPC per chain for native balance only, so the connector still works with no account.

Endpoints are configured with `ALCHEMY_API_KEY` and an optional per-chain RPC override (`EVM_RPC_URL_ETHEREUM`, `EVM_RPC_URL_POLYGON`). The connector is read-only and never requires a signing key.

## Why

- **Alchemy is all-chains on one key.** Ethereum (chainid 1) and Polygon (chainid 137) are covered by the same key, so there is no per-chain credential to manage.
- **Transfers need block time.** Raw `eth_getLogs` gives a block number, not a timestamp; `alchemy_getAssetTransfers` returns `metadata.blockTimestamp`, which is what a dated movement needs without an extra `eth_getBlockByNumber` per event.
- **Balances in one call.** `alchemy_getTokenBalances` returns many ERC-20 balances in a single request, which is friendlier to rate limits than one `balanceOf` per token.
- **Keyless fallback preserved.** The product's rule is read-only with no key on the happy path. The keyless public RPC still reads native balance, and Alchemy is an upgrade that unlocks tokens and history.

## Options considered

| Option | Free tier | Key | Coverage | Notes |
| --- | --- | --- | --- | --- |
| **Alchemy** (chosen) | 30M compute units / mo, 25 RPS | Yes (one key, all chains) | RPC + token balances + asset transfers + NFTs | Enhanced methods carry block time; best fit for accounting |
| Public RPC (publicnode) | Yes | No | Native balance, `eth_getLogs`, receipts | Keyless fallback; needs self-managed decoding and block-time lookups |
| Etherscan V2 | 3 calls/s, 100k/day | Yes (one key, 60+ chains) | `txlist`, `tokentx`, internal txns | Strong alternative; ERC-20 and internal transfers. Not required given Alchemy |
| QuickNode | Free trial / paid | Yes | RPC only | Supported as a per-chain override; no enhanced accounting methods |
| Ankr / Chainstack | Free tiers | Yes | RPC only | Not needed now |

Rate-limit notes (retrieved for #43): Alchemy free is 25 requests/second and 30M compute units/month; public Ethereum/Polygon RPCs are keyless but rate-limited and not for production.

## Consequences

- Two enhanced methods tie the connector to Alchemy. They are isolated behind the reader and a chain provider interface, so a different provider is a small change and the override URLs already allow a pure-RPC setup for native balances.
- A key is required for token balances and transfers. It lives in the deployment environment (or gitignored `.env.local` for local runs) and must follow the secret rules in #13.
- Ethereum and Polygon share one reader and one chain-config module; adding a third EVM chain is a config entry.

## References

- Alchemy token balances and asset transfers: https://www.alchemy.com/docs
- Alchemy pricing: https://www.alchemy.com/pricing
- Etherscan V2 rate limits and chains: https://docs.etherscan.io/rate-limits, https://docs.etherscan.io/supported-chains
- Ethereum JSON-RPC: https://ethereum.org/en/developers/docs/apis/json-rpc/
