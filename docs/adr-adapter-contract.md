# ADR: Adapter contract

Status: accepted
Applies to: issue #11 (`Add recorded-fixture contract tests for every source adapter`).

## Decision

Every source adapter (chain, exchange, custodian) satisfies one shared contract,
defined once in `src/adapters/contract-suite.ts` and run for each adapter in
`src/adapters/contract.test.ts` against recorded fixtures with faked clients.

The contract asserts, for every adapter:

- **Shape.** `fetchBalances` returns a non-empty, valid array (asset code,
  non-negative bigint minor units, ISO-8601 as-of); `fetchTransactions` returns
  valid movements (non-empty external id, `YYYY-MM-DD` date, in/out, positive
  bigint, description), with **unique** external ids so a movement is never
  double counted; `listAccounts` returns a non-empty, valid array.
- **Determinism.** Balances for the same query are stable across calls.
- **Window.** Movements respect `since` (and `until` when given).
- **Read-only.** A read path never calls `globalThis.fetch` (the adapter's own
  client is faked); a spy asserts zero network calls.
- **Clear failure.** An invalid account id rejects.
- **Implementation state.** An implemented adapter resolves; a stub rejects with
  `AdapterNotImplementedError`.

The validators in `src/adapters/contract.ts` are pure and also usable at a
runtime boundary.

## Why

- Before this, each adapter had its own tests and nothing enforced the rules
  across all of them. A new adapter could be added that returned `number`
  balances, duplicated ids, or reached the network, and CI would not notice.
- The contract is the single place the rules live, so a reviewer can point at
  one file. A registry-coverage test fails if a venue or custodian exists
  without a contract case, so an adapter cannot silently skip it.
- Recorded fixtures and faked clients keep the tests offline, so CI needs no
  keys and no network.

## Consequences

- Adding a source adapter means adding a `runAdapterContract` case. The
  coverage test in `contract.test.ts` enforces that every registered exchange
  venue and custodian is covered.
- The contract is deliberately **shape and behaviour** only. It does not assert
  provider-specific values beyond an optional recorded expectation, so a change
  in a provider's data does not make the contract brittle.
- `AdapterNotImplementedError` remains the signal for a stubbed port; the
  contract's "does not touch the network" test also proves a stub never reaches
  out.

## Coverage

Chain: Solana, Ethereum, Polygon, Bitcoin, Sui.
Exchange: Kraken, Bybit, Binance, Gate.io, Backpack.
Custodian: BitGo, Fireblocks.

## References

- Contract suite: `src/adapters/contract-suite.ts`
- Validators: `src/adapters/contract.ts`
- Wiring and coverage: `src/adapters/contract.test.ts`
