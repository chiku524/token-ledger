# Contract deployments

Authority model, invariants and the seed table live in
`docs/adr-solana-contracts.md`. This file is the deployment record and runbook.

## Devnet

Both programs are deployed and upgradeable. The upgrade authority is the local
deployer keypair; production will use a separate multi-party governance key.

| Program | Program ID | Upgrade authority |
| --- | --- | --- |
| `service_balance` | `DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb` | `7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp` |
| `treasury_payables` | `33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs` | `7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp` |

> **Devnet is stale as of the charge-receipt change.** The deployed bytecode
> predates the `collect_cycle(cycle)` signature and the `ChargeReceipt` account
> (#187). Rebuild and redeploy before relying on `contracts/scripts/*.ts` on
> devnet; the IDL/types and the litesvm suite already reflect the new shape.

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
solana program show DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb --url devnet
solana program show 33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs --url devnet
```

## Client configuration

The app must resolve the cluster, program IDs, mint and token program from
server configuration recorded here, never from user input. That config module
does not exist yet; it is tracked with CHAIN-01 and the execution boundary in
#170.

## Production (not done)

- Move the upgrade authority from the deployer keypair to a separate multi-party
  governance key.
- Verify the issuer USDC mint before any mainnet launch; devnet uses a local test
  mint.
- Independent review of the money-moving code is a mainnet launch gate (#164).
  Do not call the system immutable while upgrades remain possible.

## Token

Version one uses one explicitly configured USDC mint and the legacy SPL Token
program. The mint must be verified before any mainnet launch. Devnet uses a
locally created test mint (see the integration tests).
