# Token Ledger — Solana contract project plan

Version 1.1 • 2 October 2026 • Proposed implementation specification

## 1. Product outcome

Add two connected capabilities to Token Ledger:

1. **Service Balance:** customers fund a USDC vault and authorize bounded recurring subscription charges. They can revoke future billing and withdraw unspent funds.
2. **Accounts Payable:** companies fund a separate USDC treasury, submit invoice-linked payment requests, obtain wallet approvals, execute payments, and reconcile the results into their books.

The resulting workflow is: connect financial sources → prepare books and invoices → approve and execute eligible payments → ingest settlement evidence → prepare journals → sync accounting systems → generate reports.

The existing read-only accounting product remains available independently. Connecting an address never grants spending permission. These modules require explicit wallet-signed enrollment and funding.

This plan is based on the supplied Token Ledger README and the agreed product direction, not a review of repository code. Paths and database changes below are proposed. Delivery estimates are engineering estimates, not commitments. Prices and caps in examples are illustrative.

## 1A. How this merges into the existing app

**Build Billing and Payables inside the existing Token Ledger application.** Reuse its Next.js frontend, database sessions, organization/entity model, Postgres database, accounting engine and reports. The two Solana programs are separately deployed execution components used by that same app. This is an additive integration, not a replacement accounting system or a separate customer application.

### Existing flow and added flow

The existing workflow continues: customer adds wallets/exchanges/custodians → adapters read balances and movements → accounting workflow processes them → posted journals sync to accounting software → reports are produced. The README describes some integrations as incomplete or requiring live credentials; preserve those implementation caveats.

The new Payables workflow joins that same pipeline: accountant creates supplier invoice → registered company wallets approve payment → treasury program executes transfer → finalized settlement becomes a source movement → existing accounting workflow matches the invoice and prepares/posts the journal → existing export and reporting paths continue.

Billing is a parallel subscription workflow: customer funds Service Balance → authorizes plan → contract collects an eligible charge → backend verifies settlement → Postgres entitlement is updated → existing app enables the subscribed features. Subscription access does not control the customer's right to withdraw funds or approve a treasury exit.

### Where customers see it

| Existing app location | Integration |
| --- | --- |
| Sign-in and Users | Keep password sessions, roles and entity scopes; add verified wallet bindings for financial actions |
| Settings → Connections | Keep current read-only wallet, exchange and custodian connections |
| Settings → Billing | Add service balance, subscription mandate, renewal status, receipts, cancellation and withdrawals |
| Dashboard → Payables | Add Suppliers, Invoices and Approval Inbox |
| Dashboard → Treasury | Add dedicated treasury balance, signer policy, funding, payment history and recovery controls |
| Books / Journals | Present matched settlements and reviewable journal proposals through the existing posting workflow |
| Reports | Include posted results using existing entity, period and currency filters |
| Operations | Extend connection health with collection, execution, confirmation and indexing health |

The billing wallet, watched accounting wallets and treasury approver wallets can all be different. A wallet signature authorizes a financial action; it does not replace the existing login. An app admin role does not grant contract spending authority.

### Exact integration with existing code

| Existing component | Keep | Add |
| --- | --- | --- |
| src/auth | Sessions, CSRF protections, roles and entity scopes | One-use wallet-control challenges and audited user/entity wallet bindings |
| src/adapters/sources | Read-only chain/exchange/custodian ingestion | Controlled-vault discovery and canonical transfer linking |
| src/adapters/execution/solana | New boundary | Transaction construction, submission and finalized state verification, isolated from source readers |
| src/ledger | Balanced entries, functional-currency handling, immutability and reversals | Invoice-settlement matching and reviewable journal proposals |
| src/db | Existing organizations, entities, sources, journals and audit log | Billing, invoices, approvals, contract projections, settlements and outbox migrations |
| src/app | Existing dashboard and navigation | Billing and Payables screens within the same application |
| Scheduled sync / Operations | Existing ingestion and operational history | Frequent durable transaction workers and recoverable chain indexing |
| AccountingSyncAdapter | Existing posted-journal export contract | Settlement-linked idempotency and independent export retries |

### Concrete example: a 500 USDC supplier invoice

1. The accountant signs into the existing app and enters an invoice under the correct legal entity.
2. They select its separately funded Solana treasury. Merely connecting a watched wallet never enables spending.
3. The proposal binds the invoice identity, recipient and 500 USDC amount. Two registered approvers sign under the company's policy.
4. A worker submits execution. The contract checks the approvals and pays the supplier.
5. After finalization, the contract indexer and ordinary wallet reader link their observations to one canonical movement.
6. The accounting workflow links the movement to the invoice. If a payable was already booked, settlement clears it under the customer's accounting policy instead of recognizing the expense again.
7. The accountant reviews and posts the proposed journal using existing rules. The existing adapter exports it; reports read the posted books.

If exporting fails, retry only the export. Never repeat the supplier payment to repair an accounting integration failure.

### Deployment and migration approach

Keep the Next.js/Vercel app and Postgres deployment. Add the Rust programs in the same repository workspace, deploy them separately to Solana, and configure cluster, program IDs, mint and generated client types in the app. Use an appropriate worker runtime for prompt renewals, confirmation and backfill; the README's daily cron can keep servicing existing source ingestion.

Use additive database migrations and organization-level feature flags. Existing customers continue using Connections, Books and Reports without funding a contract. With DATABASE_URL unset, keep the current fictional demo behavior; never present simulated charges or payments as real settlements. Enable execution only with configured persistence, authenticated users, verified deployment settings and explicit wallet authorization.

### Customer rollout within the implementation roadmap

1. **Billing release:** enable Service Balance and subscription entitlements after billing review and release gates. No treasury permission is involved.
2. **Payables release:** enable treasury setup, invoices, wallet approvals and execution after treasury review. Settlement evidence and basic duplicate detection are required from the first payment; manual journal review is acceptable initially.
3. **Accounting automation release:** improve automatic matching, proposal generation, export recovery and reconciliation coverage. This expands automation, not the requirement to record every payment correctly.

These are product release slices of the engineering phases in Section 12, not additional projects or additional estimates. Each money-moving mainnet release remains subject to its applicable security gates.

## 2. Scope and decisions

| Area | Version-one decision |
| --- | --- |
| Execution chain | Solana only; existing multichain reads continue |
| Asset | One explicitly configured USDC mint and legacy SPL Token Program per deployment; verify issuer mint before launch |
| Contracts | Two Rust/Anchor programs with separate authorities and token vaults |
| Billing model | Fixed-price, prepaid 30-day service periods; no metered or retroactive charges |
| Treasury approvals | Configurable M-of-N wallets; recommended company setup 2-of-3 |
| Payment unit | One full invoice settlement per proposal; no installments or swaps |
| Automation | Backend workers submit eligible transactions; contracts enforce permissions |
| Ledger posting | Finalized settlements produce source evidence and proposed journals; accountant reviews before posting |
| Company data | Invoices, names, documents and account codes remain off-chain |
| Tokens | No new platform token, staking, yield or lending |
| Cross-chain payments | Deferred; no bridges in version one |

Use 30-day billing terminology in the UI. Do not call it calendar-month billing. Calendar-month plans can be added later with an explicitly defined schedule.

### Definition of success

A customer can deposit, activate a plan, cancel renewal and withdraw without depending on a Token Ledger employee. A company can approve and pay a supplier while Token Ledger's backend has no unilateral treasury spending power. Each successful payment creates one settlement record and, after review, one exportable accounting result despite retries or indexer restarts.

## 3. Architecture and trust boundaries

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Existing Next.js app | Login, invoices, wallet interaction, reports, transaction previews | Hold customer signing keys |
| Billing program | Enforce signed subscription terms and move service funds | Access company treasury funds |
| Treasury program | Enforce proposals, approvals, limits and payment uniqueness | Trust database roles as on-chain authority |
| PostgreSQL | Private documents, accounting, mappings and chain projections | Treat a submitted transaction as settled |
| Transaction worker | Collect authorized charges; execute approved payments | Change recipient, amount or approved terms |
| Indexer | Backfill and verify finalized chain activity | Rely exclusively on transient event logs |
| Accounting adapter | Export posted entries using existing idempotency rules | Export the same settlement twice |

Use a PDA as token authority for each vault. PDA addresses are derived from program ID and seeds; programs authorize their use through signed cross-program invocations [S1]. Token movements use checked token transfers with validated mint, decimals, token program and account authority [S2].

Implement programs as separate packages in one workspace and use shared client types, but do not share a fund-moving authority. No cross-program call is required between billing and treasury in the first release. A billing pause or expired subscription must never prevent a customer from accessing treasury exit controls.

### Authority model

- **App owner/admin:** can manage application users and request setup; not automatically a treasury signer.
- **Billing controller:** customer wallet authorized to fund, accept terms, revoke and withdraw its billing vault. MVP supports a single controller; show this explicitly even if the treasury uses multiple signers.
- **Treasury approver:** registered on-chain signer; can approve defined actions under company policy.
- **Proposer:** registered on-chain wallet allowed to submit payment drafts, but cannot execute unapproved payments.
- **Executor/relayer:** any caller may execute an already eligible payment; the fixed destination and contract checks prevent diversion.
- **Billing collector:** designated operational key may trigger only permitted charges to the fixed merchant destination.
- **Upgrade authority:** production governance controlling deployed program upgrades; separate from collector and fee-payer keys.

A wallet connection uses a one-use, expiring challenge bound to session, organization, domain and cluster. A verified signature proves wallet control, not employment or company ownership. Bootstrap requires the existing organization owner and initial wallet signers to approve the mapping. Store its audit evidence.

## 4. Module A — Service Balance

### 4.1 Customer journey

1. Billing page shows plan price, period duration, maximum total authorization, expiry, merchant destination and cancellation terms.
2. Customer connects a Solana wallet and creates a billing vault.
3. Customer deposits USDC. Deposit alone does not enable charging.
4. Customer signs a mandate authorizing a specific immutable plan version.
5. Activation collects the first period atomically with mandate creation; insufficient funds aborts activation.
6. A worker collects the next eligible period. Successful charges extend access.
7. Customer revokes renewal at any time. Paid access continues to its recorded end.
8. Customer withdraws any remaining balance to the controller's own token account.

Keep “cancel renewal” separate from “withdraw balance.” Offer a combined transaction for both. No automatic wallet top-up or unlimited token delegation.

### 4.2 Billing rules

Store amounts in base units using checked integer arithmetic. Read and verify mint decimals; never use floating point on-chain.

Each mandate fixes: plan version, price, period duration, merchant token account, start time, authorization expiry, maximum total debit and generation number. It also stores total debited, next cycle number, paid-through time and revoked flag.

For every collection:

- Require authorized collector, correct vault, mint and merchant account.
- Require active, unexpired mandate and unpaused collection path.
- Require current time at or after paid-through time.
- Require the exact expected next cycle number.
- Require amount equals the signed fixed price and cumulative debit remains within the signed lifetime cap.
- Require sufficient token balance.
- Transfer and update cycle state atomically; a failure changes neither.
- New coverage starts at the later of current time and prior paid-through time and ends one period later. This avoids charging for a backlog of missed periods.
- Require the new coverage end to be within mandate authorization expiry.

Example: a customer deposits 100 USDC and accepts an illustrative 20 USDC per 30 days plan, capped at 100 USDC. Activation charges 20; four subsequent successful collections exhaust the authorization. Additional deposits do not increase that cap. The customer must sign a new authorization.

### 4.3 Cancellation, changes and races

- Revocation becomes effective when its transaction executes. A collection ordered earlier on-chain can still succeed; communicate this accurately.
- Unspent balance is freely withdrawable by the controller. Do not reserve future charges or impose a lock period.
- Withdrawal may leave insufficient funds for renewal; access ends at paid-through time, with an explicitly off-chain grace policy if desired.
- A new plan version never changes existing mandates. An upgrade or cap increase requires a fresh customer signature.
- MVP changes take effect after existing paid coverage. Replacing a mandate preserves paid-through time and increments generation; it must not trigger a second charge for overlapping coverage.
- Revoked mandates remain readable. Keep generation/cycle counters persistent so account recreation cannot revive old charges.
- Missed cycles are not debts. A later successful charge buys a new full service period.
- Paid charges are not automatically refundable. A merchant refund is a separate signed transfer with a linked receipt; it cannot silently reset charge counters or reactivate a mandate.

### 4.4 Proposed accounts

| Account | Seed concept | Essential fields |
| --- | --- | --- |
| MerchantConfig | merchant + ID | admin governance, collector, fixed USDC mint, token program, collection pause |
| PlanVersion | merchant + plan ID + version | immutable price, duration, destination, terms commitment |
| BillingVault | customer namespace + vault ID | controller, merchant, mint, token account, mandate generation |
| Mandate | billing vault + generation | signed limits, plan, paid-through, cycle counter, total debited, expiry, revoked |
| ChargeReceipt | mandate + cycle | amount, covered interval, collected timestamp, receipt reference |

Use opaque fixed-size IDs and domain-separated seed encodings. Validate all parent-child relationships. One organization may have several legal entities; map each vault explicitly to the entity paying the bill.

### 4.5 Instructions and events

Instructions: initialize_merchant, create_plan_version, create_billing_vault, deposit, activate_mandate_and_charge, collect_cycle, revoke_mandate, replace_mandate, withdraw, set_collection_pause, rotate_collector.

Events: BillingVaultCreated, Deposited, MandateActivated, CycleCollected, MandateRevoked, MandateReplaced, Withdrawn, CollectorRotated, CollectionPauseChanged. Events identify state accounts, amounts and cycle IDs; avoid confidential text. Durable counters/receipts remain authoritative if logs are missed.

Merchant administration cannot withdraw customer funds, replace the destination of an existing mandate, or enlarge a customer's allowance. Collector rotation changes operational authority only. An upgrade authority could change code; document that trust separately.

## 5. Module B — Accounts Payable treasury

### 5.1 Company journey

1. Owner enables Treasury for a legal entity, selects signer wallets and threshold, and verifies the setup transaction.
2. Company funds a dedicated USDC vault. No existing connected wallet is swept automatically.
3. Accountant creates an invoice record: supplier, invoice reference, asset, amount, due date, documents and proposed accounting treatment.
4. A registered proposer publishes a payment proposal with a private-document commitment and exact payment parameters.
5. Approvers inspect supplier identity, recipient address, amount, invoice and policy, then each signs approval.
6. Once eligible and sufficiently funded, the worker executes the payment.
7. The indexer verifies finalized settlement and links it to the invoice.
8. Accountant reviews the proposed journal; posted entries flow through existing Xero/QuickBooks/ERP adapters.

### 5.2 Treasury policy

A TreasuryConfig holds a unique approver set, threshold, proposer set, policy version, mint, per-payment limit, UTC-day spending cap, maximum proposal lifetime and execution pause. Bound list sizes, initially up to 10 approvers; validate threshold between 1 and signer count.

All changes to signers, threshold, limits, proposers, recovery destination or pause state require an on-chain governance proposal approved under the current threshold. Token Ledger support has no override. A lost quorum therefore cannot be recovered by resetting an app password; explain this during setup and recommend independent backup signers.

An individual approver may trigger an emergency execution pause. Unpause requires quorum. Pausing blocks supplier execution, but governance and a quorum-authorized emergency exit remain available. This trades unilateral denial of service for fast loss containment; display the actor and reason commitment.

A policy change increments policy_version. Pending payment and governance proposals using an older version become non-executable and require replacement and fresh approvals. Store a stable invoice identity through replacements.

### 5.3 Proposal lifecycle

Draft invoices remain off-chain. The on-chain lifecycle is Proposed → Ready → Executed, with terminal Cancelled and Expired states. Ready means enough current approvals; it does not reserve liquidity or guarantee execution. Insufficient funds is a retryable execution condition, not a terminal status.

The proposer can cancel its pending proposal. Any approver can veto/cancel before execution. The company can create a replacement with a new revision. Revoking an individual approval is allowed until execution; readiness then recalculates. Every check is repeated at execution, not inferred from cached readiness.

Approved fields are immutable: treasury, payment ID, invoice key, revision, recipient owner, mint, gross amount, execution window, policy version and document commitment. Any edit creates a new revision and invalidates old approvals.

### 5.4 Duplicate prevention and invoice identity

Create an InvoiceSettlement PDA keyed by treasury and opaque invoice key, separate from the revisioned proposal. It stores the active revision and whether the invoice has settled. Creating a replacement atomically advances that revision and makes older revisions non-executable. Successful transfer atomically marks the invoice paid.

A contract can stop repeated payment of the same invoice key. It cannot detect that a user assigned two different keys to the same real-world invoice. The backend must enforce normalized supplier + invoice reference uniqueness within an entity, present possible duplicates, and retain reviewed exception decisions.

Version one supports a single full settlement per invoice. Partial payments and credit notes need a later allocation model. A batch is a UI grouping of individual proposals, not an all-or-nothing settlement promise.

### 5.5 Execution checks

Before moving funds, require all of the following:

- Treasury and proposal belong together and all accounts have the expected owner/PDA derivation.
- Proposal is current, not cancelled, not paid and within its execution window.
- Policy version equals current treasury policy.
- Distinct authorized approvals meet the threshold; duplicate signatures cannot increase votes.
- Execution is not paused.
- Recipient is the approved wallet's canonical token account for the approved mint and token program.
- Amount is positive and within per-payment and remaining UTC-day caps.
- Vault has sufficient USDC; proposed payments do not reserve balances in version one.
- Invoice settlement record is unpaid and points to this active revision.

Transfer tokens, consume the invoice settlement key, update daily spend and mark the proposal executed in one atomic transaction. Disallow generic arbitrary CPI destinations. Counters use checked arithmetic.

The spending day is floor(on-chain Unix timestamp / 86,400). Show UTC reset time; it is a fixed daily window, not a rolling 24-hour cap. Simultaneous executions serialize through shared mutable treasury spending state. Payments that lose a balance/cap race remain pending until eligible or expired.

### 5.6 Withdrawals and emergency exit

A company withdrawal is a treasury payment to a company-controlled wallet and follows quorum rules. No admin-only withdraw method exists.

For emergency recovery, quorum may approve a dedicated exit action to a recovery wallet registered in treasury policy. It works while payment execution is paused and bypasses operational daily/per-payment caps; it does not bypass quorum. After execution, close the treasury to new payments. Changing the recovery wallet itself requires current quorum and invalidates pending proposals. This explicit governance power is visible in the UI and audit trail.

### 5.7 Proposed accounts and instructions

| Account | Purpose |
| --- | --- |
| TreasuryConfig | Signers, roles, thresholds, policy version, caps, pause and recovery configuration |
| TreasuryAuthority + token account | Program-controlled USDC balance |
| PaymentProposal | Exact transfer parameters, revision, approvals, expiry and state |
| InvoiceSettlement | Persistent paid marker and active revision for one invoice identity |
| GovernanceProposal | Quorum-approved policy change, unpause or emergency exit |
| DailySpend | Treasury/day total, or equivalent bounded state in TreasuryConfig |

With a bounded signer set, an approval bitmap tied to an immutable policy version is sufficient; do not count wallet signatures in an unbounded array. Keep replay-critical paid markers permanently even if larger expired proposal accounts are later closed. Define account-closure/rent return rules before implementing pruning; omit pruning in MVP.

Instructions: initialize_treasury, deposit, propose_payment, replace_payment, approve_payment, revoke_approval, cancel_payment, execute_payment, pause_execution, propose_policy_change, approve_governance, execute_policy_change, propose_emergency_exit, execute_emergency_exit.

Events: TreasuryCreated, TreasuryFunded, PaymentProposed, PaymentApproved, ApprovalRevoked, PaymentCancelled, PaymentExecuted, PolicyChanged, TreasuryPaused, TreasuryUnpaused, EmergencyExitExecuted.

## 6. UX and signing safety

Add Billing, Treasury, Suppliers, Invoices and Approval Inbox pages. Extend Operations with collection/indexing/settlement health.

Before every signature, show action, network, asset, exact amount, recipient, fees, affected policy and relevant commitment. A billing mandate also shows cap, expiry, renewal schedule and cancellation behavior. Treasury setup shows who can move money and how quorum recovery works.

Show transaction status as awaiting signature, submitted, confirmed, finalized or failed. “Paid” and accounting export eligibility require finalized settlement. An RPC timeout means unknown/pending until reconciled, not automatically failed.

Store invoices privately. Addresses and transfer amounts remain public on-chain. A salted document hash reduces guessing of document contents but does not conceal public payment metadata. Do not publish supplier names, invoice numbers, emails or document URLs.

Customer wallet keys remain in customer wallets. A sponsor can pay network fees without holding the approval keys. Restrict sponsored requests to decoded allowed instructions, fee ceilings and organization quotas. Provide customer-paid transactions and a minimal independent CLI as fallback so access to funds does not depend on an active subscription or the hosted frontend.

## 7. Backend and database integration

Implementation follows the existing-app integration in Section 1A. These directories extend the current repository and share its organization/entity model.

### Proposed code layout

- contracts/programs/service_balance/ — billing Rust program.
- contracts/programs/treasury_payables/ — treasury Rust program.
- contracts/tests/ — integration, adversarial and state-machine tests.
- packages/solana-client/ — generated instruction types, PDA derivation, transaction decoding.
- src/billing/ — entitlement projection, plan display, collection jobs.
- src/treasury/ — invoices, proposals, approvals and settlement matching.
- src/adapters/execution/solana/ — new signing/submission boundary, separate from existing read-only sources.
- src/jobs/ — collection, execution, confirmation and backfill workers.
- docs/adr-solana-contracts.md — implementation decisions and authority model.

### Proposed tables

| Table | Key fields and constraints |
| --- | --- |
| wallet_bindings | org/entity, user, wallet, cluster, challenge evidence, revoked_at |
| chain_deployments | cluster, program IDs, approved mint, token program, IDL/build version |
| billing_vaults / mandates | chain addresses, entity, controller, signed terms, finalized status |
| billing_charges | unique cluster + mandate + cycle; amount, coverage, transaction reference |
| treasury_accounts | entity, PDA, mint, policy version, signer-policy projection |
| suppliers / supplier_destinations | private supplier details, address verification history |
| invoices | entity, supplier, normalized reference, amount, document commitment and nonce |
| payment_proposals / approvals | PDA, invoice key, revision, policy version, approver and state |
| chain_transactions | logical operation ID, every signature attempt, blockhash expiry, status |
| chain_events | unique cluster + signature + instruction/event ordinal |
| payment_settlements | unique cluster + treasury + invoice key; proposal and transfer evidence |
| settlement_journal_links | settlement → proposed/posted journal; uniqueness by posting purpose |
| job_outbox / chain_cursors | durable retries, leases, backfill checkpoints |

Use database transactions for invoice/proposal intent plus outbox creation. All API mutations retain existing session, CSRF and entity-scope enforcement. These controls complement on-chain checks; they do not replace signatures.

### API sketch

- POST /api/billing/vaults and /mandates/prepare — prepare wallet-signable transactions.
- POST /api/billing/mandates/:id/revoke/prepare and /withdraw/prepare.
- POST /api/treasury/setup/prepare and /fund/prepare.
- POST /api/invoices; POST /api/invoices/:id/payment/prepare.
- POST /api/payments/:id/approve/prepare, /cancel/prepare, /execute.
- GET /api/transactions/:operationId — verified transaction status.
- GET /api/treasury/:id/reconciliation — vault, proposals and accounting differences.

Prepare endpoints never treat client-supplied success as chain evidence. Resolve cluster, mint and program addresses from the server's deployment configuration; reject cross-organization object access.

## 8. Workers, settlement and retries

Contracts do not wake themselves on a schedule. A durable worker runs collection and payment execution. The current once-daily cron described in the README is unsuitable for prompt payment confirmation; use a persistent worker/queue or a deployment scheduler that supports the required cadence. Initial operational target: check due work each minute, use bounded RPC retries, and backfill independently of live subscriptions.

1. Create a stable logical operation ID before sending.
2. Build and simulate the exact transaction; check human approval is still applicable.
3. Record each attempt and signature. Resend the same signed transaction while valid.
4. For blockhash expiration, query signature and authoritative PDA state before rebuilding.
5. If the operation already succeeded, link the existing result. Otherwise rebuild with the same logical cycle/proposal identity.
6. Verify finalized transaction success plus program state and token movement before projecting settlement.
7. Atomically insert settlement, source movement and journal-proposal outbox work with unique keys.
8. Retry downstream accounting independently; never repeat a token payment to fix a failed export.

Solana confirmation handling must account for blockhash expiry and forks [S4]. Use live notifications for latency and RPC history/state scans for completeness. Retain cursors, deployment slots, raw receipts and decoded instruction versions. Monitor provider history limits and choose an archival source when required.

## 9. Accounting integration and double-counting controls

The existing README says Solana movement ingestion uses net balance changes. Extend it for controlled vaults: register vault token accounts, decode program payments and retain gross payment/fee identities. Net deltas alone may hide multiple operations in one transaction.

Generic wallet readers and program-specific indexers may observe the same movement. Introduce one canonical transfer identity using cluster, transaction signature and instruction location; attach both observations to it. Preserve a separate internal-transfer link when both sender and recipient belong to the same entity.

| Event | Accounting integration behavior |
| --- | --- |
| Company funds its own treasury vault | Internal asset movement; do not invent supplier expense |
| Customer funds service vault | Separate funding from service consumption; mapping requires accountant-approved policy |
| Subscription charge settles | Link service charge, coverage interval and receipt; propose policy-based classification |
| Supplier invoice entered | May already create a payable through the existing workflow |
| Supplier payment settles | Match to that payable; do not recognize the same expense again |
| Transaction fee | Record SOL fee only for the actual paying entity; distinguish sponsored fees |
| Payment attempt fails | No supplier settlement; retain any actual network fee evidence |
| Merchant refund arrives | Link original charge and propose corresponding adjustment |

These are workflow requirements, not final IFRS journal prescriptions. Amount valuation, prepaid treatment, realized differences, tax and functional-currency measurement remain in the accounting engine under reviewed customer policy. Token quantities and functional-currency amounts remain separate; on-chain USDC amounts are not a substitute for MYR/SGD valuation.

Do not call existing postJournalEntry directly from a payment worker. Produce a reviewable proposal, then use existing balanced-journal validation, immutable posting and reversal paths. Export only after the internal posting succeeds. External OAuth/export capabilities in the README must be independently verified before promising a live demo.

Reconciliation compares finalized vault balances, transfer history, invoice settlements and booked token quantities. Show unmatched incoming transfers, manual/external transfers, missed observations and accounting exceptions. Direct USDC transfers into a vault must be detected even if the deposit instruction was bypassed; actual token balance is authoritative.

## 10. Security requirements and invariants

Anchor account constraints support signer, address, owner, seed and account-relation validation; each instruction needs an explicit validation matrix [S3].

Mandatory invariants:

1. Billing collector cannot debit the treasury or send customer funds to an arbitrary recipient.
2. Mandates cannot exceed signed price, coverage frequency, expiry or total authorization.
3. One billing cycle and one invoice settlement identity cannot execute twice.
4. Customer cancellation and billing withdrawal need no merchant signature.
5. Treasury spending requires the current quorum and exact approved parameters.
6. Stale-policy approvals and stale proposal revisions cannot execute.
7. Failed token transfers leave counters and settlement state unchanged.
8. Customer funds are never lent, staked, pooled between organizations or used for platform fees without authorization.
9. Deposit/withdraw/collection arithmetic reconciles to actual token balances, allowing explicitly observed unsolicited deposits.
10. Every exportable journal has finalized supporting settlement evidence and an internal posting identity.

Reject wrong mint/token program, substituted destination accounts, forged account owners, invalid seeds, duplicate approvers, zero or overflow amounts, self-transfer payment tricks and account-reinitialization attempts. Bind destination ownership explicitly; matching the mint alone is insufficient. Restrict version one to the configured legacy token mint so transfer-fee/hook extensions cannot change amount semantics.

Keep upgrade authority under separate multi-party governance. Publish program IDs, verified build details and upgrade policy. Production upgrade procedure should include review, announced delay, monitoring and customer exit opportunity; any enforced delay must be implemented/tested rather than claimed from an operational promise. Do not call the system immutable while upgrades remain possible.

An issuer may freeze token accounts and the network/RPC may be unavailable; operational pauses and emergency exits cannot override token-program restrictions. The platform must describe actual fund-control and upgrade powers without promising unconditional withdrawal availability.

## 11. Test plan and acceptance gates

| Suite | Required cases |
| --- | --- |
| Billing happy path | Fund, activate, renew, revoke, withdraw; receipt and entitlement match |
| Billing boundaries | Exact renewal time, expiry, cap exhaustion, zero balance, partial balance, no backlog billing |
| Billing adversarial | Double collection, destination substitution, old generation, revoked mandate, concurrent withdraw/charge |
| Treasury happy path | 2-of-3 approval, full payment, invoice marker, daily spend and settlement |
| Treasury adversarial | One signer, duplicate vote, wrong recipient, stale policy, stale revision, repeated invoice execution |
| Treasury lifecycle | Revoked approval, veto, expiry, pause, quorum unpause, quorum exit, changed recovery wallet |
| Concurrency | Competing payments exceeding balance/cap, concurrent replacement/execute, replay after timeout |
| State fuzzing | Random deposit, charge, revoke, approval, replacement, execution sequences preserve invariants |
| Indexer recovery | Missed logs, restart, duplicate notifications, provisional fork, backfill and direct vault transfer |
| Accounting | Both-side observation dedup, prior payable matching, sponsored fees, journal/export retries |
| Tenant isolation | Cross-entity IDs, wallet binding replay, unauthorized transaction preparation |
| Release | Pinned build, migration rehearsal, verified program addresses, key/upgrade drills |

Launch blockers: any path enabling unapproved spending, duplicate execution, lost funds through normal cancellation, or duplicate accounting exports; unresolved critical/high security findings. Independent review of money-moving code is a mainnet launch gate. Devnet demonstration is not evidence of production security.

## 12. Delivery roadmap

Estimate: one experienced Solana/full-stack engineer, with a second reviewer available. Tasks are sequential effort ranges; external review calendar time is additional. Baseline repository health and wallet integrations may change estimates.

| Phase | Estimate | Deliverables | Exit condition |
| --- | --- | --- | --- |
| 0 — Design freeze | 2–3 working days | Authority matrix, account schemas, billing rules, threat model, pinned toolchain | Written invariants and transaction flows agreed |
| 1 — Shared foundation | 3–4 days | Anchor workspace, cluster config, wallet binding, SDK, local validator tests | Wallet-signed deposit/withdraw prototype |
| 2 — Service Balance | 5–7 days | Billing program, Billing UI, collector, entitlements and receipts | Cancellation, cap and replay tests pass on devnet |
| 3 — Treasury payments | 8–12 days | Proposal/governance program, invoices, approvals, execution and exit | 2-of-3 payment plus adversarial tests pass |
| 4 — Accounting integration | 5–7 days | Durable indexer, canonical movements, settlement/journal links, export recovery | One payment yields one reviewed posted/exported result |
| 5 — Hardening | 5–8 days | Fuzzing, operational drills, build verification, audit package | Internal release gates pass |
| 6 — Reviewed mainnet pilot | External review + remediation + 3–5 days rollout | Low-cap opt-in pilot, monitoring and support runbook | Pilot reconciles with no unexplained differences |

Phases 0–5 total approximately 28–41 engineering working days, or roughly 6–9 weeks for one engineer. A narrower devnet demo can be targeted in 10–15 working days by limiting plans to one, treasury to fixed 2-of-3, payments to single invoices, and accounting to reviewed internal journals/CSV. That demo must not be represented as mainnet-ready or as having complete governance/recovery hardening.

### Suggested implementation tickets

- ARCH-01: freeze roles, pause powers, signed billing terms and treasury exit policy.
- CHAIN-01: programs, accounts, errors, events, IDL and deployment configuration.
- BILL-01: vault and controller-authorized deposit/withdraw.
- BILL-02: plan versions, mandates, first charge and cycle idempotency.
- BILL-03: revoke/replace and entitlement projection.
- AP-01: treasury policy and quorum governance.
- AP-02: invoices, proposal revisions and persistent settlement keys.
- AP-03: approvals, limits, execute, cancellation and emergency exit.
- APP-01: wallet binding, transaction previews and independent exit client.
- OPS-01: durable workers, retries, sponsor limits and alerting.
- DATA-01: finalized indexer, canonical movement deduplication and backfill.
- ACCT-01: settlement matching, proposed journals and export retry linkage.
- SEC-01: invariant tests, independent review and verified release.

## 13. Operational costs and launch controls

Budget separately for RPC/history access, worker/queue infrastructure, SOL network fees, account rent deposits, sponsor-key infrastructure, security review and support. Measure transaction compute and account sizes from the actual program before pricing; avoid assuming a fixed fiat fee. Solana fee documentation describes base and optional prioritization components [S5].

Initial release uses one token and bounded account sizes. Keep replay-critical records; estimate their lifetime rent footprint per customer. Decide whether the customer or platform funds account creation and make it visible. Do not silently take SOL network fees from approved USDC invoice amounts.

The pilot should have explicit per-payment and per-treasury limits, low sponsored-fee ceilings and a small customer cohort. Alert on collection failures, pending transactions, indexer lag, USDC reconciliation differences, sponsor SOL balance, RPC disagreement, policy changes, pauses and program upgrades.

Incident sequence: pause only affected execution paths; preserve billing withdrawals and treasury governance exits where technically possible; reconcile signatures/state before retries; communicate affected operations; fix/review/redeploy under upgrade policy. On-chain settled transfers cannot be rolled back by rolling back the website.

## 14. Demo script and measurable completion

1. Show current multichain balances and reports.
2. Deposit test USDC into Service Balance and activate a clearly labeled demo plan.
3. Show exact authorized cap and successful receipt; demonstrate duplicate collection rejection.
4. Revoke future renewal and withdraw unused funds.
5. Fund an entirely separate treasury with test USDC.
6. Create a supplier invoice and payment proposal.
7. Approver A signs; execution fails below quorum. Approver B signs; execution succeeds.
8. Attempt the same payment again; contract rejects it.
9. Show finalized settlement, invoice match and accountant-reviewed journal.
10. Export through a verified live connector or explicitly labeled CSV/demo path.

Release metrics: zero unauthorized transfers; zero duplicate settlements; zero duplicate posted/exported accounting results; every executed proposal matched or visibly flagged; indexer restart recovers without manual payment re-execution. Track confirmation and export latency separately from correctness.

## 15. Decisions to confirm before implementation

The plan supplies defaults so work can start, but these require product sign-off during Phase 0:

- Actual subscription prices, authorization caps and renewal expiry options.
- Whether single-controller billing is acceptable for institutional customers; quorum-controlled billing enrollment is a later option.
- Treasury default limits, signer bounds, recovery wallet and veto/pause policy.
- Fee sponsorship budget and customer-paid fallback.
- Supplier address verification process and who may change a stored destination.
- Document retention, customer visibility and accounting review policy.
- Governance/upgrade implementation and independent security reviewer.

No staking or platform token is needed to deliver either module. The contract utility is concrete: customer-controlled billing permissions and company-controlled supplier payments, both feeding the existing accounting system.

## 16. Technical references

Checked 2 October 2026. Protocol mechanisms below are sourced; product rules, account schemas, timelines and architecture are proposed design decisions.

- [S1 — Solana: Program Derived Addresses](https://solana.com/docs/core/pda)
- [S2 — Solana: Transfer Tokens](https://solana.com/docs/tokens/basics/transfer-tokens)
- [S3 — Anchor: Account Constraints](https://www.anchor-lang.com/docs/references/account-constraints)
- [S4 — Solana: Transaction Confirmation and Expiration](https://solana.com/developers/cookbook/transactions/confirmation)
- [S5 — Solana: Fee Structure](https://solana.com/docs/core/fees/fee-structure)

Source project context: user-supplied Pasted text.txt describing Token Ledger. No repository implementation or deployment was performed as part of this planning deliverable.
