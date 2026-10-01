# ADR: Bitcoin data source

Status: accepted
Applies to: issue #48 (`Sub-epic: Bitcoin` → `Evaluate and choose a free Bitcoin indexer`) and #50 (`Implement Bitcoin chain reader`).

## Decision

Implement the Bitcoin connector against the **Esplora HTTP API**, defaulting to the free, keyless public instance at `https://mempool.space/api`. Allow an override with `BITCOIN_ESPLORA_URL` for a self-hosted Esplora instance or another provider (Blockstream's Esplora implements the same API).

The adapter is read-only, never signs, and never needs a key. Bitcoin Core's own JSON-RPC is intentionally not used: it requires a full node and a wallet context, and the public Esplora API already returns exactly the UTXO and transaction data the ledger needs.

## Why

- **Keyless and free.** Both mempool.space and Blockstream Esplora are public and keyless, which matches the product's read-only, no-secret rule.
- **UTXO-native.** Esplora exposes `GET /address/:address/utxo` (unspent outputs for a balance) and `GET /address/:address/txs` (transactions touching the address), which is the shape needed to model in/out movements.
- **One API, two providers.** mempool.space and Blockstream serve the same Esplora schema, so switching is a URL change.
- **Spike-verified.** The UTXO, address, and transaction endpoints were called against the public instance and returned real data for a mainnet address.

## Options considered

| Option | Free tier | Key | Coverage | Notes |
| --- | --- | --- | --- | --- |
| **mempool.space Esplora** (chosen) | Yes, public | No | Address stats, UTXOs, transactions, fee estimates | Same schema as Blockstream; well-maintained |
| Blockstream Esplora | Yes, public | No | Same Esplora schema | Drop-in via `BITCOIN_ESPLORA_URL` |
| Self-hosted Esplora / mempool | Self-host cost | No | Same schema, no rate limit | The production path for heavy backfills |
| Bitcoin Core JSON-RPC | Full node required | RPC auth | Full node data | Heavier to operate; wallet context needed for address indexes |
| QuickNode / Alchemy Bitcoin | Paid | Key | RPC + enhanced | Alchemy has no Bitcoin; not required |

Rate-limit notes (from the providers' public documentation, retrieved for #48): the public mempool.space and Blockstream instances are rate-limited and intended for light use; a self-hosted instance or a provider endpoint removes the limit. The reader must therefore surface HTTP 429 (with `Retry-After`) and avoid unbounded per-address fan-out.

## Consequences

- The connector works with no account, key, or spend, matching the schema's "no API key" rule.
- Public instances rate-limit history, so long backfills should point `BITCOIN_ESPLORA_URL` at a self-hosted instance. That is an operations choice, not a code change.
- Bitcoin has no token layer here; only BTC is modelled. Ordinals and BRC-20 are out of scope.

## References

- mempool.space API: https://mempool.space/docs/api/rest
- Esplora API: https://github.com/Blockstream/esplora/blob/master/API.md
- Self-hosting: https://github.com/Blockstream/esplora, https://github.com/mempool/mempool
