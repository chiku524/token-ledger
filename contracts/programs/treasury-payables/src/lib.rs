//! Token Ledger — Accounts Payable treasury.
//!
//! A company funds a dedicated USDC vault and approves supplier payments under
//! an M-of-N policy. The backend has no unilateral spending power: every
//! payment requires on-chain quorum, within caps, for an approved recipient, and
//! an invoice settles at most once.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::GovernanceKind;

declare_id!("5k5vSj1LWFLZ6doBfdwyYnxHKTpt1ot4SmBroby6ZqRi");

#[program]
pub mod treasury_payables {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn initialize_treasury(
        ctx: Context<InitializeTreasury>,
        entity: Pubkey,
        mint: Pubkey,
        token_program: Pubkey,
        threshold: u8,
        approvers: Vec<Pubkey>,
        proposers: Vec<Pubkey>,
        per_payment_limit: u64,
        daily_limit: u64,
        max_proposal_lifetime: i64,
        recovery: Pubkey,
    ) -> Result<()> {
        instructions::initialize_treasury(
            ctx,
            entity,
            mint,
            token_program,
            threshold,
            approvers,
            proposers,
            per_payment_limit,
            daily_limit,
            max_proposal_lifetime,
            recovery,
        )
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit(ctx, amount)
    }

    pub fn propose_payment(
        ctx: Context<ProposePayment>,
        invoice_key: [u8; 32],
        revision: u32,
        recipient_owner: Pubkey,
        gross_amount: u64,
    ) -> Result<()> {
        instructions::propose_payment(ctx, invoice_key, revision, recipient_owner, gross_amount)
    }

    pub fn approve_payment(ctx: Context<ApprovePayment>) -> Result<()> {
        instructions::approve_payment(ctx)
    }

    pub fn revoke_approval(ctx: Context<ApprovePayment>) -> Result<()> {
        instructions::revoke_approval(ctx)
    }

    pub fn cancel_payment(ctx: Context<CancelPayment>) -> Result<()> {
        instructions::cancel_payment(ctx)
    }

    pub fn execute_payment(ctx: Context<ExecutePayment>) -> Result<()> {
        instructions::execute_payment(ctx)
    }

    pub fn pause_execution(ctx: Context<PauseExecution>) -> Result<()> {
        instructions::pause_execution(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn propose_governance(
        ctx: Context<ProposeGovernance>,
        kind: GovernanceKind,
        new_threshold: u8,
        new_approver_count: u8,
        new_approvers: [Pubkey; MAX_APPROVERS],
        new_per_payment_limit: u64,
        new_daily_limit: u64,
        new_recovery: Pubkey,
    ) -> Result<()> {
        instructions::propose_governance(
            ctx,
            kind,
            new_threshold,
            new_approver_count,
            new_approvers,
            new_per_payment_limit,
            new_daily_limit,
            new_recovery,
        )
    }

    pub fn approve_governance(ctx: Context<ApproveGovernance>) -> Result<()> {
        instructions::approve_governance(ctx)
    }

    pub fn execute_policy_change(ctx: Context<ExecutePolicyChange>) -> Result<()> {
        instructions::execute_policy_change(ctx)
    }

    pub fn execute_emergency_exit(ctx: Context<ExecuteEmergencyExit>) -> Result<()> {
        instructions::execute_emergency_exit(ctx)
    }
}

use token_ledger_shared::MAX_APPROVERS;
// force Fri Oct  2 13:49:48 IST 2026
