# Independent security review checklist — Solana contracts

Status: **open gate for mainnet.** An independent reviewer must complete this
against the deployed bytecode before any money-moving release. Devnet runs and
the litesvm suite are not production security (see `docs/adr-solana-contracts.md`).

Scope: `contracts/programs/service-balance` (billing) and
`contracts/programs/treasury-payables` (accounts payable), plus the
signing/submission boundary in `src/adapters/execution/solana`. Line references
are from `docs/token-ledger-solana-contract-plan-2.md` (the source spec).

## How to review

1. Build from a pinned, verified tree: `contracts/rust-toolchain.toml` (host) and
   `cargo-build-sbf --tools-version v1.57` (SBF). Compare the resulting program
   IDs and `.so` hashes against `contracts/DEPLOYMENTS.md`.
2. Read each instruction's account context and the validation matrix below,
   against the instruction body — not the IDL alone.
3. Attempt to violate each invariant with a hand-built transaction (or a litesvm
   test), not by reasoning about the happy path.
4. Record findings against `#164`. Report unresolved critical/high findings as
   launch blockers.

## A. Trust boundaries (plan §3)

| Component | Must not | What to check |
| --- | --- | --- |
| App / server actions | hold a customer signing key | grep the repo: no private key material; wallet signs; server only prepares plans |
| Billing program | access treasury funds | no shared authority or CPI into treasury; separate programs and vaults |
| Treasury program | trust DB roles as authority | approvals are on-chain signers, never a session/role claim |
| Postgres / indexer | treat *submitted* as *settled* | projections gate on a finalized slot only |
| Transaction worker | change recipient/amount/terms | it reuses signed, reviewed plans; it cannot mutate them |
| Accounting adapter | export a settlement twice | idempotency by (settlement, purpose) |

## B. Mandatory invariants (plan §10) — attempt to break each

Billing:
1. The collector cannot debit the treasury or send customer funds anywhere but
   the fixed merchant destination.
2. A mandate can never exceed the signed price, period, expiry, or total
   authorization (cap).
3. A billing cycle **and** an invoice settlement each execute at most once.
4. Customer cancellation and billing withdrawal require **no** merchant
   signature.
5. Treasury spending requires the current quorum and the exact approved
   parameters.
6. Stale-policy approvals and stale proposal revisions cannot execute.
7. A failed token transfer leaves counters and settlement state unchanged
   (atomicity).
8. Customer funds are never lent, staked, pooled across organizations, or taken
   as platform fees without authorization.
9. Deposit / withdraw / collection arithmetic reconciles to actual token
   balances, allowing for explicitly observed unsolicited deposits.
10. Every exportable journal has finalized supporting settlement evidence and an
    internal posting identity.

## C. Rejection matrix — must be refused (plan §10)

For each, confirm the program refuses, with the right error, before any transfer:

- wrong mint, or wrong token program (v1 restricts to the configured legacy mint)
- substituted destination account (recipient token account not the approved one)
- forged account owner / wrong `Account<T>` ownership
- invalid or colliding PDA seeds
- duplicate approvers (one wallet counted twice toward quorum)
- zero or overflowing amounts (checked arithmetic, no float)
- self-transfer / payment tricks
- account re-initialization attempts (e.g. replaying `init`)
- destination ownership binding: matching the mint alone must be insufficient —
  bind the owner explicitly.

## D. Authority model (plan §3, ADR)

Confirm each actor cannot exceed its role:

- app owner/admin is **not** automatically a treasury signer
- billing controller (customer) sole-controller in v1 — stated explicitly in UI
- proposer cannot execute; approver cannot act alone; executor/relayer is
  interchangeable (fixed destination + checks prevent diversion)
- collector can only trigger to the fixed destination
- upgrade authority is separate from collector and fee-payer keys

Also verify the wallet-binding challenge is one-use, expiring, and bound to
session + organization + domain + cluster, and that a verified signature proves
**wallet control only**, not company ownership.

## E. Billing semantics (plan §4)

- first charge is atomic with activation; insufficient funds leave no mandate
- no backlog billing: coverage starts at `max(now, paid_through)`
- `next_cycle` must equal the caller's cycle argument (replay fails pre-transfer)
- replacement preserves paid-through and carries the cap; no double-charge on
  overlap
- cancel-renewal and withdraw are separate, and withdraw is never blocked by a
  pause or a revoked mandate

## F. Treasury semantics (plan §5)

- quorum by distinct approvers; no self-approval without an owner override (app
  rule) — and the on-chain threshold is independent of app roles
- per-payment and fixed UTC-day caps, reset on a new UTC day
- one proposal per (invoice key, revision); a higher revision supersedes
- a policy change makes older proposals and approvals non-executable
- emergency exit requires quorum **and** paused, pays only the registered recovery
  wallet, bypasses caps (not quorum), and closes the treasury

## G. Upgrade and operational controls (plan §10, §13)

- upgraded authority under separate **multi-party** governance (not the deployer
  keypair); production upgrade procedure has review, announced delay, monitoring
  and a customer-exit opportunity — and any enforced delay is implemented/tested,
  not merely promised
- publish program IDs, verified build details, and the upgrade policy
- document actual fund-control and upgrade powers without promising unconditional
  withdrawal (an issuer can freeze accounts; RPC can be unavailable)

## H. What to produce from the review

- A findings list (severity, affected instruction, repro, fix) filed under #164.
- An explicit statement of residual risk and any invariant that could only be
  shown by reasoning rather than a test.
- A go / no-go recommendation for a money-moving release, with the reviewer
  named and the reviewed commit + program IDs recorded.

## Evidence already available (not a substitute for review)

- litesvm suite: 37 tests (billing 14, treasury 17, invariants 6) that drive the
  real programs in-process, including time-warp, fuzz, concurrency and
  tenant-isolation cases. `cd contracts/tests && cargo test`.
- Program unit tests: 7. `cd contracts && cargo test`.
- ADR invariants and authority matrix: `docs/adr-solana-contracts.md`.
- Deployment record: `contracts/DEPLOYMENTS.md`.
