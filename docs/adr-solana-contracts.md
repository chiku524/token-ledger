# ADR: Solana contracts (Service Balance + Accounts Payable)

Status: accepted for devnet. **Not mainnet-ready** — independent review is a launch
gate.
Applies to: issue #151 (epic) and its CHAIN/BILL/AP tasks (#153–#159), plus the
authority freeze in #152.

## Context

The product's accounting surface is read-only: chains, exchanges and custodians
are observed, never signed for. Two capabilities need to *move* money and are
therefore Solana programs rather than database writes:

1. **Service Balance** — a customer funds a USDC vault and authorizes bounded,
   recurring 30-day subscription charges they can cancel and withdraw at will.
2. **Accounts Payable** — a company funds a treasury, and a quorum of its
   wallets approves invoice-linked supplier payments.

Both are additive: an unfunded customer keeps the existing app untouched, and
connecting a wallet never grants spending permission. This ADR records the
authority model, the on-chain invariants, and the deployment procedure. It is the
written counterpart to `contracts/` and `contracts/DEPLOYMENTS.md`.

## Decision

Two Rust/Anchor programs in one workspace, deployed separately to Solana:

- `contracts/programs/service-balance` (`service_balance`) — billing.
- `contracts/programs/treasury-payables` (`treasury_payables`) — accounts payable.
- `contracts/programs/shared` — domain-separated PDA seeds and pure predicates
  only. It holds no authority and moves no funds.

They share client types but **not** a fund-moving authority. There is no
cross-program call in version one, so a billing pause or an expired subscription
can never block a treasury exit, and vice versa.

### Authority matrix

| Action | Who can do it | Who cannot |
| --- | --- | --- |
| Deposit into a billing vault | the vault controller | the merchant |
| Activate / replace / revoke a mandate | the vault controller | the merchant |
| Withdraw unspent balance | the vault controller | the merchant (never) |
| Trigger a collection | the merchant's collector key | anyone changing the destination |
| Change the merchant destination | — (fixed at `initialize_merchant`) | the merchant, a collector |
| Rotate the collector / pause collection | the merchant admin | the controller |
| Create a plan version | the merchant admin | the controller |
| Propose a treasury payment | a configured proposer | an approver acting alone |
| Approve / revoke a treasury approval | a configured approver | a proposer, the executor |
| Execute an eligible payment | any signer (checks are fixed) | a caller who diverts the recipient |
| Pause execution | any approver | a proposer |
| Change policy / unpause / emergency exit | quorum under the current threshold | Token Ledger support (no override) |
| Upgrade a program | the upgrade authority (devnet: the deployer keypair) | users |

The **controller** is the customer's signing key; the app never holds it. The
**collector** is an operational role: it can only trigger a charge to the fixed
destination, never redirect or enlarge one. The **merchant admin** configures a
plan and destination but can never touch customer funds.

### Account and seed model

All PDAs are domain-separated (see `shared::seeds`), so one account type can
never collide with another:

| Seed | Account | Program |
| --- | --- | --- |
| `merchant` + admin | `MerchantConfig` | billing |
| `plan_version` + merchant + plan_id + version | `PlanVersion` | billing |
| `billing_vault` + merchant + controller | `BillingVault` (and its token authority) | billing |
| `billing_vault_token` + vault | vault `TokenAccount` | billing |
| `mandate` + vault | `Mandate` | billing |
| `charge_receipt` + mandate + cycle | `ChargeReceipt` | billing |
| `treasury_config` + entity | `TreasuryConfig` | treasury |
| `treasury_authority` + treasury | treasury token authority | treasury |
| `treasury_token` + treasury | treasury `TokenAccount` | treasury |
| `payment_proposal` + treasury + invoice_key + revision | `PaymentProposal` | treasury |
| `invoice_settlement` + treasury + invoice_key | `InvoiceSettlement` | treasury |
| `governance_proposal` + treasury + policy_version + kind | `GovernanceProposal` | treasury |
| `daily_spend` + treasury | `DailySpend` | treasury |

The mandate PDA is one-per-vault (not per-generation): replacement rewrites it in
place, preserving the PDA and `paid_through` so overlapping coverage is never
charged twice. The `generation` field is recorded but is **not** a guard; the
single-PDA design is what prevents a stale mandate from collecting. This is
asserted by the replace tests and noted against #152/#186.

Mint decimals are verified at initialization: `initialize_merchant` and
`initialize_treasury` require the passed mint account's `decimals` to equal
`shared::USDC_DECIMALS` (6), so on-chain amounts and the app share one scale. A
wrong-decimal mint is refused (`WrongMintDecimals`).

### Divergences from the plan

`docs/token-ledger-solana-contract-plan-2.md` is the source spec; these are the
deliberate departures, recorded so a reviewer does not treat them as drift:

- **Mandate seed is `mandate + vault`, not `vault + generation`.** The plan's
  §4.4 says `+ generation`, but §4.3 requires replacements to preserve
  paid-through and to not double-charge overlap. One PDA rewritten in place
  satisfies §4.3; the `generation` counter is kept for projection but is not a
  seed or a guard.
- **Governance instructions are merged.** The plan §5.7 names separate
  `propose_policy_change` and `propose_emergency_exit`; the program uses one
  `propose_governance` taking a `GovernanceKind` (PolicyChange / Unpause /
  EmergencyExit), seeded by policy version and kind byte so the three can coexist.
- **No explicit `replace_payment`.** Revisioning is done by proposing a higher
  revision for the same invoice key; the older revision becomes non-executable
  via the settlement's `active_revision`. This is the plan's §5.3 behaviour
  without a separate instruction.
- **`ChargeReceipt` layout differs.** The plan §4.4 lists a "receipt reference";
  the account stores bump, mandate, vault, cycle, amount, coverage window and
  `collected_at`. There is no external reference id; the PDA is the reference.
- **The plan's `WrongCycle` is an addition here.** Collection requires the named
  cycle to equal `mandate.next_cycle`, so a replay fails before any transfer.
- **No `MandateActivated` on-chain until now.** §4.5 lists it; it is now emitted
  after the atomic first charge, carrying price and paid-through.

### On-chain invariants (must always hold)

Billing:
1. A collection transfers exactly the signed fixed price, only to the merchant's
   fixed destination, only within the signed cap and authorization expiry.
2. `total_debited <= max_total_debit` for the mandate's whole life.
3. A cycle is collected at most once; the receipt PDA is unique by mandate and
   cycle and the mandate's `next_cycle` must match the caller's argument.
4. No backlog billing: new coverage starts at `max(now, paid_through)`, so missed
   periods are never charged in arrears.
5. Withdrawal and cancellation need no merchant signature and are never blocked
   by a collection pause or a revoked mandate.
6. The atomic first charge means activation with insufficient funds leaves no
   mandate and no receipt behind.

Treasury:
1. A payment executes only with `>= threshold` distinct approvals under the
   current `policy_version`, within the per-payment and fixed UTC-day caps, for
   the approved recipient's own token account.
2. One settlement per invoice key: `InvoiceSettlement.paid` is set atomically
   with the transfer.
3. A revision at or below the active one cannot execute; a policy change makes
   older proposals and approvals non-executable.
4. The emergency exit requires quorum **and** a paused treasury, pays only the
   registered recovery wallet, bypasses the caps (not quorum), and closes the
   treasury to new payments.
5. Database roles are never on-chain authority.

### Pinned toolchain

Anchor 0.32.1, Solana CLI 3.0.x, Program IDs in `Anchor.toml` and each
`declare_id!`. The host Rust toolchain is pinned in `contracts/rust-toolchain.toml`
(**1.98.1**); the litesvm test workspace needs rustc ≥ 1.97.1. Anchor's default
platform-tools cannot parse the `edition2024` dependency in the `solana-program`
v2.3 tree, so SBF builds use:

```
cargo-build-sbf --tools-version v1.57 --sbf-out-dir target/deploy
```

The app resolves cluster, program IDs, mint and token program from server
configuration, never from user input (CHAIN-01, tracked with the execution
boundary in #170).

### Product decisions (plan Section 15)

The plan supplies defaults so work can start; these are the choices adopted for
version one, each marked with whether it is **frozen** or a **default to revisit**
during a pilot. Prices and caps in any example are illustrative.

| Decision | Version one |
| --- | --- |
| Subscription price and caps | Per-merchant plan version, set at publish time; illustrative figures only. **Revisit** with real pricing before launch. |
| Billing enrollment | **Single-controller** (one customer wallet per vault). Acceptable for v1; quorum-controlled enrollment is a later option. **Frozen** for v1. |
| Treasury limits and signer bounds | Configurable M-of-N, recommended **2-of-3**; explicit per-payment and daily caps; max 10 approvers (`MAX_APPROVERS`). **Frozen** for v1. |
| Recovery / pause / veto | Any approver may pause; unpause and policy change need the current threshold; the emergency exit pays the registered recovery wallet and closes the treasury. **Frozen** for v1. |
| Fee sponsorship | Backend sponsorable for eligible transactions; a **low sponsored-fee ceiling** and customer-paid fallback. Exact budget is **TBD**. |
| Supplier verification | A destination is stored per (supplier, chain); a payment requires a verified destination. Who may change it is an operator policy. **Default to revisit.** |
| Document policy | Invoices, names and documents stay **off-chain**; only an opaque invoice key is on-chain. Retention is an app policy. **Default to revisit.** |
| Governance / upgrade | Upgrade authority is a real power; devnet uses the deployer keypair. Production needs **separate multi-party governance**. **Frozen** that it must change before mainnet. |
| Independent reviewer | A named independent security reviewer is **required before mainnet**; not yet appointed (#164). **Open gate.** |

No staking or platform token is needed. The concrete utility is
customer-controlled billing permissions and company-controlled supplier payments,
both feeding the existing accounting system.

## Consequences

- **Tested at the instruction level.** `contracts/tests` runs 37 litesvm tests
  (billing 14, treasury 17, invariants 6) that load the built `.so` and drive the
  real programs in-process, including time-warp, fuzz, concurrency and
  tenant-isolation cases devnet cannot do. The programs' own unit tests (7: one
  per program plus shared predicates) run under `cargo test` in `contracts`.
  CI (`.github/workflows/contracts.yml`) builds the SBF programs then runs both
  suites.
- **Not production security.** Devnet demonstration is not evidence of mainnet
  safety. Independent review of money-moving code is a launch gate (#164); the
  fuzz harness explores operation order, not randomized byte payloads.
- **Upgrade authority is a real power.** Devnet uses the deployer keypair;
  production needs separate multi-party governance. Do not describe the system as
  immutable while upgrades remain possible.
- **One configured USDC mint** per deployment; the issuer mint must be verified
  before a mainnet launch. An issuer can freeze accounts and RPC can be
  unavailable, so no promise of unconditional withdrawal is made by these
  programs.
- An on-chain settlement cannot be rolled back by rolling back the website.

## References

- Plan: `docs/token-ledger-solana-contract-plan-2.md`.
- Deployment record and runbook: `contracts/DEPLOYMENTS.md`.
- Programs: `contracts/programs/`; tests: `contracts/tests/`.
- Independent security review checklist: `docs/contract-security-review.md` (#164).
