# Session handoff

State of the connector work, so a later session can resume without re-deriving it.

## Where things stand

Everything is committed, pushed, and green.

- Branch: `54-exchange-kraken`, working tree clean.
- Tests: 214 passing (`pnpm test`), plus typecheck, lint, and build green.
- Five open PRs, stacked in this order (each based on the one below):

| PR | Head | Base | Title |
| --- | --- | --- | --- |
| #90 | `45-solana-connector` | `main` | Solana: live read-only chain connector |
| #91 | `42-evm-chains` | `45-solana-connector` | EVM chains: Ethereum and Polygon |
| #92 | `47-bitcoin` | `42-evm-chains` | Bitcoin: live read-only chain connector |
| #93 | `51-sui` | `47-bitcoin` | Sui: live read-only chain connector |
| #95 | `54-exchange-kraken` | `51-sui` | Exchange connectors: all five venues |

Merge order is bottom-up: #90 → #91 → #92 → #93 → #95. GitHub retargets each PR's base automatically as the one below merges. No PR uses a closing keyword, so **no issue closes on merge** — closure is a deliberate reviewer step.

## What is implemented

**Chain readers (live, read-only, keyless except where noted).**
- Solana — JSON-RPC, `SOLANA_RPC_URL` (Helius). Issue #8, sub-epic #45.
- Ethereum + Polygon — Alchemy JSON-RPC + `ALCHEMY_API_KEY`, public-RPC fallback. Issues #7/#44, sub-epic #42.
- Bitcoin — keyless Esplora via `mempool.space`, `BITCOIN_ESPLORA_URL`. Issues #49/#50, sub-epic #47.
- Sui — keyless public GraphQL (JSON-RPC was removed by Sui Foundation). Issue #53, sub-epic #51.

**Exchange connectors (live, read-only, credential required).**
- Kraken, Bybit, Binance, Gate.io, Backpack behind one shared framework and a generic `VenueExchangeAdapter`.
- Encrypted credential storage (AES-256-GCM, `CONNECTOR_ENCRYPTION_KEY`) and a frontend authorisation flow.
- Issues #13, #55, #94, #9, sub-epic #54.

**Docs:** `docs/adr-{solana,evm,bitcoin,sui}-data-source.md` and `docs/adr-exchange-connectors.md`.

## The one outstanding item

Per-venue **live** exchange verification. The adapters are built and fixture-tested, but no real exchange key has been used yet. To finish issue #9's live checklist:

1. Create a read-only key for one venue (scopes in `docs/adr-exchange-connectors.md`).
2. Put it in `.env.local` (gitignored), e.g. `KRAKEN_API_KEY` / `KRAKEN_API_SECRET`.
3. Run `pnpm exchange:verify kraken` (or `bybit`, `binance`, `gate`, `backpack`).

Then the #9 live checkbox can be marked and sub-epic #54 is complete.

## Keys in use (local only, gitignored)

`.env.local` holds Helius, Alchemy, and QuickNode keys. Never commit, never print. `git grep` for any of them should return nothing.

## How to resume

```bash
git checkout 54-exchange-kraken
git pull
pnpm install
pnpm test        # expect 214 passing
gh pr checks 95  # expect pass
```

## Ideas not yet started

- Custodian connectors (sub-epic #56).
- The remaining Reconciliation & Controls, Market Data, Automation, and Hardening epics.
- A live exchange key to close #9.
