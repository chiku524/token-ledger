# ADR: Solana data source

Status: accepted
Applies to: issue #46 (`Sub-epic: Solana` → `Evaluate and choose a free Solana data source`) and #8 (`Implement Solana chain reader`).

## Decision

Implement the Solana connector against the **standard Solana JSON-RPC 2.0 interface**, using the free, keyless public cluster endpoint by default:

```
https://api.mainnet-beta.solana.com
```

Allow an override with the `SOLANA_RPC_URL` environment variable so a private provider can be dropped in without a code change (for example a Helius, QuickNode, or Chainstack endpoint). The adapter must remain read-only and must never require a signing key.

## Why

- **No key, no cost.** The product deliberately stores no chain credentials. The public endpoint needs no API key and has no billing, so a self-hosted or trial install can read real data immediately.
- **Standards-based.** The same JSON-RPC calls work against any provider, so switching providers is a URL change, not a rewrite.
- **Enough for the accounting use case.** We need balances and movements for a watched address. That is `getBalance`, `getTokenAccountsByOwner`, `getSignaturesForAddress`, and `getTransaction` — all on the standard interface.
- **Verified in a spike.** `getBalance`, `getSignaturesForAddress`, and `getTokenAccountsByOwner` were called against the public mainnet endpoint and returned real data (an SPL token account with `decimals: 6` parsed from `jsonParsed`). No key was used.

## Options considered

| Option | Free tier | Key required | Indexing / history | Notes |
| --- | --- | --- | --- | --- |
| **Public Solana RPC** (chosen default) | Yes — ~100 req / 10 s / IP on mainnet | No | Live balances, SPL token accounts, signatures, transactions | Keyless and free; rate-limited and "not for production" per Solana docs, so it is the default, not the only option |
| Helius | 1M credits / mo, 10 RPS | Yes | Strong: DAS API, parsed transaction history, webhooks | Best archival/parsing upgrade path; enable via `SOLANA_RPC_URL` |
| QuickNode | 10M credits, 15 RPS (free trial) | Yes | RPC only | Trial is time-limited; fine as an override |
| Alchemy | Free compute-unit tier | Yes | Enhanced APIs, historical token balances at a slot | Good archival option |
| Chainstack | 3M RU / mo, 25 RPS | Yes | RPC only; archive needs a paid tier | No archive on the free tier |

Rate-limit notes (from providers' public pricing and the Solana cluster docs, retrieved for #46):

- Public mainnet: max 100 requests / 10 s / IP; 40 concurrent connections; 100 MB / 30 s. Subject to change and to blocking of high-traffic IPs.
- The adapter must therefore batch requests where possible and surface HTTP 429 (with `Retry-After`) rather than failing hard.

## Consequences

- The connector works with no account, key, or spend, which matches the "read-only, no secret" rule in the schema and README.
- Public-endpoint rate limits mean history depth is limited and long backfills may need a private endpoint. That is an operations choice, not a code change.
- Provider-specific features (Helius parsed history, webhooks) are out of scope here and belong to the parent connector epic (#41).
- A private endpoint is still optional and unauthenticated by default; if one needs a key, the key is supplied through the provider URL and must follow the secret-handling rules in #13.

## References

- Solana RPC HTTP methods: https://solana.com/docs/rpc/http
- Solana clusters and public endpoints: https://solana.com/docs/core/clusters
- Provider pricing: https://www.helius.dev/pricing, https://www.quicknode.com/pricing, https://www.chainstack.com/pricing, https://www.alchemy.com/solana
