# Contract deployments

Authority model, invariants and the seed table live in
`docs/adr-solana-contracts.md`. This file is the deployment record and runbook.

## Devnet

| Program | Program ID | Upgrade authority |
| --- | --- | --- |
| `service_balance` | `GgYegKVx47vYApyQijG6g4k2pAGGJ6ub9DUhKUE4gZYo` | `7b9TAu16LR9eqs1R9WUdKHtfq7auaxhzF2SPtSHXLP6w` |
| `treasury_payables` | `5k5vSj1LWFLZ6doBfdwyYnxHKTpt1ot4SmBroby6ZqRi` | `7b9TAu16LR9eqs1R9WUdKHtfq7auaxhzF2SPtSHXLP6w` |

**Status:** program IDs and `declare_id!` are committed for a fresh deploy under
the authority above. Confirm on-chain with `solana program show` after
`solana program deploy` (see below); fill in deploy signatures in the PR once
live.

Previous devnet IDs (`DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb`,
`33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs`) remain on-chain under upgrade
authority `7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp` but are no longer the
committed client targets. New program keypairs were chosen so charge-receipt /
`collect_cycle` bytecode can ship without that prior authority.

## Build

Anchor's default platform-tools (v1.51, rust 1.84) cannot parse a transitive
`edition2024` dependency in the current `solana-program` v2.3 tree. Build with the
newer toolchain:

```bash
cd contracts
cargo-build-sbf --tools-version v1.57 --sbf-out-dir target/deploy
```

This writes `target/deploy/service_balance.so` and
`target/deploy/treasury_payables.so`.

The **host** toolchain is pinned in `contracts/rust-toolchain.toml`, which covers
both the programs workspace and the nested `contracts/tests` litesvm workspace.
Rust **1.98.1** is the pin: the litesvm test workspace pulls agave/solana 4.3
crates that require rustc **≥ 1.97.1**, so `stable` is not safe. rustup reads the
file for any `cargo` command inside `contracts/`, so local runs and CI both use
it. The SBF build is independent of this pin (its platform-tools are v1.57).

## Verify before deploying

1. `cargo test` (program invariants) and `(cd tests && cargo test)` (litesvm
   integration) are green. CI runs both in `.github/workflows/contracts.yml`.
2. The committed IDL and types match the programs. Regenerate when instructions
   or accounts change:
   ```bash
   anchor idl build -p service_balance     -o idl/service_balance.json     -t types/service_balance.ts
   anchor idl build -p treasury_payables   -o idl/treasury_payables.json   -t types/treasury_payables.ts
   ```
3. `git status` is clean for `contracts/idl` and `contracts/types` (the client
   contract is committed).

## Deploy / redeploy

```bash
solana program deploy target/deploy/service_balance.so \
  --program-id target/deploy/service_balance-keypair.json --url devnet
solana program deploy target/deploy/treasury_payables.so \
  --program-id target/deploy/treasury_payables-keypair.json --url devnet
```

The program keypairs are generated locally and gitignored; only the declared
program IDs (above, `Anchor.toml`, and each `declare_id!`) are committed. Do not
commit deploy keypairs.

After a redeploy, confirm the on-chain program data length changed:

```bash
solana program show GgYegKVx47vYApyQijG6g4k2pAGGJ6ub9DUhKUE4gZYo --url devnet
solana program show 5k5vSj1LWFLZ6doBfdwyYnxHKTpt1ot4SmBroby6ZqRi --url devnet
```

## Client configuration

The app must resolve the cluster, program IDs, mint and token program from
server configuration recorded here, never from user input. Set
`SOLANA_CONTRACTS_CLUSTER`, `SERVICE_BALANCE_PROGRAM_ID`,
`TREASURY_PAYABLES_PROGRAM_ID`, and `USDC_MINT` (see `.env.example`).

## Production (not done)

- Move the upgrade authority from the deployer keypair to a separate multi-party
  governance key.
- Verify the issuer USDC mint before any mainnet launch; devnet uses a local test
  mint.
- Independent review of the money-moving code is a mainnet launch gate (#164);
  the reviewer checklist is `docs/contract-security-review.md`.
  Do not call the system immutable while upgrades remain possible.

## Token

Version one uses one explicitly configured USDC mint and the legacy SPL Token
program. The mint must be verified before any mainnet launch. Devnet uses a
locally created test mint (see the integration tests).
