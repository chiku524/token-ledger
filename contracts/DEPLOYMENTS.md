# Contract deployments

## Devnet

Both programs are deployed and upgradeable. The upgrade authority is the local
deployer keypair; production will use a separate multi-party governance key.

| Program | Program ID | Upgrade authority |
| --- | --- | --- |
| `service_balance` | `DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb` | `7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp` |
| `treasury_payables` | `33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs` | `7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp` |

Redeploy (after `anchor build` or `cargo-build-sbf`):

```bash
solana program deploy target/deploy/service_balance.so \
  --program-id target/deploy/service_balance-keypair.json --url devnet
solana program deploy target/deploy/treasury_payables.so \
  --program-id target/deploy/treasury_payables-keypair.json --url devnet
```

## Build note

Anchor's default platform-tools (v1.51, rust 1.84) cannot parse a transitive
`edition2024` dependency in the current `solana-program` v2.3 tree. Build with the
newer toolchain:

```bash
cargo-build-sbf --tools-version v1.57 --sbf-out-dir target/deploy
```

The app config (`src/config` later) must resolve the cluster, program IDs, mint
and token program from this record, never from user input.

## Token

Version one uses one explicitly configured USDC mint and the legacy SPL Token
program. The mint must be verified before any mainnet launch. Devnet uses a
locally created test mint (see the integration tests).
