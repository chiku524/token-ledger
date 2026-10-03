//! Accounts Payable treasury instructions.
//!
//! The treasury can only move funds to an approved recipient for a currently
//! approved payment, under the current policy version and quorum, within the
//! per-payment and fixed UTC-day caps, and never twice for the same invoice.
//! Every check is repeated at execution, not inferred from cached readiness.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use token_ledger_shared::seeds;
use token_ledger_shared::{day_index, MAX_APPROVERS};

use crate::errors::TreasuryError;
use crate::state::{DailySpend, GovernanceKind, GovernanceProposal, InvoiceSettlement, PaymentProposal, TreasuryConfig};

#[event]
pub struct TreasuryCreated {
    pub treasury: Pubkey,
    pub entity: Pubkey,
}

#[event]
pub struct TreasuryFunded {
    pub treasury: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PaymentProposed {
    pub treasury: Pubkey,
    pub proposal: Pubkey,
    pub invoice_key: [u8; 32],
    pub revision: u32,
    pub amount: u64,
}

#[event]
pub struct PaymentApproved {
    pub proposal: Pubkey,
    pub approver: Pubkey,
    pub approvals: u16,
}

#[event]
pub struct ApprovalRevoked {
    pub proposal: Pubkey,
    pub approver: Pubkey,
    pub approvals: u16,
}

#[event]
pub struct PaymentCancelled {
    pub proposal: Pubkey,
}

#[event]
pub struct PaymentExecuted {
    pub treasury: Pubkey,
    pub proposal: Pubkey,
    pub invoice_key: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PolicyChanged {
    pub treasury: Pubkey,
    pub policy_version: u64,
}

#[event]
pub struct TreasuryPaused {
    pub treasury: Pubkey,
    pub actor: Pubkey,
}

#[event]
pub struct TreasuryUnpaused {
    pub treasury: Pubkey,
}

#[event]
pub struct EmergencyExitExecuted {
    pub treasury: Pubkey,
    pub recovery: Pubkey,
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// Setup and funding
// ---------------------------------------------------------------------------

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
    require!(
        !approvers.is_empty() && approvers.len() <= MAX_APPROVERS,
        TreasuryError::TooManySigners
    );
    require!(threshold >= 1 && (threshold as usize) <= approvers.len(), TreasuryError::BadThreshold);
    require!(per_payment_limit > 0 && daily_limit > 0, TreasuryError::OverPerPaymentLimit);
    require!(max_proposal_lifetime > 0, TreasuryError::Expired);

    let config = &mut ctx.accounts.treasury;
    config.bump = ctx.bumps.treasury;
    config.authority_bump = ctx.bumps.treasury_authority;
    config.entity = entity;
    config.mint = mint;
    config.token_program = token_program;
    config.policy_version = 1;
    config.threshold = threshold;
    config.approver_count = approvers.len() as u8;
    config.proposer_count = proposers.len() as u8;
    let mut approver_set = [Pubkey::default(); MAX_APPROVERS];
    for (i, a) in approvers.iter().enumerate() {
        approver_set[i] = *a;
    }
    config.approvers = approver_set;
    let mut proposer_set = [Pubkey::default(); MAX_APPROVERS];
    for (i, p) in proposers.iter().take(MAX_APPROVERS).enumerate() {
        proposer_set[i] = *p;
    }
    config.proposers = proposer_set;
    config.per_payment_limit = per_payment_limit;
    config.daily_limit = daily_limit;
    config.max_proposal_lifetime = max_proposal_lifetime;
    config.execution_paused = false;
    config.recovery = recovery;
    config.closed = false;
    emit!(TreasuryCreated { treasury: config.key(), entity });
    Ok(())
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, TreasuryError::MathOverflow);
    let cpi = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.funder_token.to_account_info(),
            to: ctx.accounts.treasury_token.to_account_info(),
            authority: ctx.accounts.funder.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;
    emit!(TreasuryFunded {
        treasury: ctx.accounts.treasury.key(),
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
pub fn propose_payment(
    ctx: Context<ProposePayment>,
    invoice_key: [u8; 32],
    revision: u32,
    recipient_owner: Pubkey,
    gross_amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let treasury = &ctx.accounts.treasury;
    require!(!treasury.closed, TreasuryError::TreasuryClosed);
    require!(gross_amount > 0, TreasuryError::OverPerPaymentLimit);
    require!(gross_amount <= treasury.per_payment_limit, TreasuryError::OverPerPaymentLimit);
    require!(is_proposer(treasury, &ctx.accounts.proposer.key()), TreasuryError::NotAuthorized);

    let settlement = &mut ctx.accounts.settlement;
    if settlement.treasury == Pubkey::default() {
        settlement.bump = ctx.bumps.settlement;
        settlement.treasury = treasury.key();
        settlement.invoice_key = crate::state::InvoiceKey(invoice_key);
        settlement.active_revision = revision;
        settlement.paid = false;
    } else {
        // A replacement advances the active revision; older ones stop executing.
        require!(!settlement.paid, TreasuryError::InvoiceAlreadyPaid);
        require!(revision > settlement.active_revision, TreasuryError::StaleRevision);
        settlement.active_revision = revision;
    }

    let proposal = &mut ctx.accounts.proposal;
    proposal.bump = ctx.bumps.proposal;
    proposal.treasury = treasury.key();
    proposal.invoice_key = crate::state::InvoiceKey(invoice_key);
    proposal.revision = revision;
    proposal.policy_version = treasury.policy_version;
    proposal.recipient_owner = recipient_owner;
    proposal.mint = treasury.mint;
    proposal.gross_amount = gross_amount;
    proposal.created_at = now;
    proposal.expires_at = now.checked_add(treasury.max_proposal_lifetime).ok_or(TreasuryError::MathOverflow)?;
    proposal.approvals = 0;
    proposal.cancelled = false;
    proposal.executed = false;

    emit!(PaymentProposed {
        treasury: treasury.key(),
        proposal: proposal.key(),
        invoice_key,
        revision,
        amount: gross_amount,
    });
    Ok(())
}

pub fn approve_payment(ctx: Context<ApprovePayment>) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.proposal;
    let approver = ctx.accounts.approver.key();
    let index = approver_index(treasury, &approver).ok_or(TreasuryError::NotAuthorized)?;
    require!(proposal.policy_version == treasury.policy_version, TreasuryError::StalePolicy);
    require!(!proposal.cancelled, TreasuryError::Cancelled);
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    let bit = 1u16 << index;
    require!(proposal.approvals & bit == 0, TreasuryError::DuplicateApproval);
    proposal.approvals |= bit;
    emit!(PaymentApproved {
        proposal: proposal.key(),
        approver,
        approvals: proposal.approvals,
    });
    Ok(())
}

pub fn revoke_approval(ctx: Context<ApprovePayment>) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.proposal;
    let approver = ctx.accounts.approver.key();
    let index = approver_index(treasury, &approver).ok_or(TreasuryError::NotAuthorized)?;
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    proposal.approvals &= !(1u16 << index);
    emit!(ApprovalRevoked {
        proposal: proposal.key(),
        approver,
        approvals: proposal.approvals,
    });
    Ok(())
}

pub fn cancel_payment(ctx: Context<CancelPayment>) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.proposal;
    let actor = ctx.accounts.actor.key();
    // The proposer or any approver may cancel before execution.
    let allowed = is_proposer(treasury, &actor) || approver_index(treasury, &actor).is_some();
    require!(allowed, TreasuryError::NotAuthorized);
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    proposal.cancelled = true;
    emit!(PaymentCancelled { proposal: proposal.key() });
    Ok(())
}

pub fn execute_payment(ctx: Context<ExecutePayment>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let treasury = &ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.proposal;

    require!(!treasury.closed, TreasuryError::TreasuryClosed);
    require!(!treasury.execution_paused, TreasuryError::Paused);
    require!(!proposal.cancelled, TreasuryError::Cancelled);
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    require!(now <= proposal.expires_at, TreasuryError::Expired);
    require!(proposal.policy_version == treasury.policy_version, TreasuryError::StalePolicy);
    require!(proposal.executed == false, TreasuryError::AlreadyExecuted);

    // Distinct approvals meet the threshold (bitmap, so duplicates cannot add).
    require!(
        proposal.approvals.count_ones() >= treasury.threshold as u32,
        TreasuryError::NotEnoughApprovals
    );

    // The settlement marker must be unpaid and point at this revision.
    let settlement = &mut ctx.accounts.settlement;
    require!(!settlement.paid, TreasuryError::InvoiceAlreadyPaid);
    require!(settlement.active_revision == proposal.revision, TreasuryError::StaleRevision);

    // Recipient is the approved owner's token account for the approved mint.
    let recipient = &ctx.accounts.recipient_token;
    require!(recipient.owner == proposal.recipient_owner, TreasuryError::WrongRecipient);
    require!(recipient.mint == treasury.mint, TreasuryError::WrongMint);
    require!(ctx.accounts.treasury_token.mint == treasury.mint, TreasuryError::WrongMint);

    // Amount within per-payment and remaining daily caps.
    let amount = proposal.gross_amount;
    require!(amount <= treasury.per_payment_limit, TreasuryError::OverPerPaymentLimit);
    let daily = &mut ctx.accounts.daily_spend;
    if daily.treasury == Pubkey::default() {
        daily.bump = ctx.bumps.daily_spend;
        daily.treasury = treasury.key();
        daily.day = day_index(now);
        daily.spent = 0;
    }
    if daily.day != day_index(now) {
        daily.day = day_index(now);
        daily.spent = 0;
    }
    let new_spent = daily.spent.checked_add(amount).ok_or(TreasuryError::MathOverflow)?;
    require!(new_spent <= treasury.daily_limit, TreasuryError::OverDailyLimit);

    // Sufficient balance.
    require!(ctx.accounts.treasury_token.amount >= amount, TreasuryError::InsufficientFunds);

    // Transfer, then mark settlement paid, update daily spend and executed.
    let treasury_key = treasury.key();
    let authority_bump = treasury.authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[seeds::TREASURY_AUTHORITY, treasury_key.as_ref(), &[authority_bump]]];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.treasury_token.to_account_info(),
            to: recipient.to_account_info(),
            authority: ctx.accounts.treasury_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi, amount)?;

    daily.spent = new_spent;
    settlement.paid = true;
    proposal.executed = true;

    emit!(PaymentExecuted {
        treasury: treasury.key(),
        proposal: proposal.key(),
        invoice_key: proposal.invoice_key.0,
        recipient: proposal.recipient_owner,
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Pause and governance
// ---------------------------------------------------------------------------

pub fn pause_execution(ctx: Context<PauseExecution>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let actor = ctx.accounts.actor.key();
    require!(approver_index(treasury, &actor).is_some(), TreasuryError::NotAuthorized);
    treasury.execution_paused = true;
    emit!(TreasuryPaused { treasury: treasury.key(), actor });
    Ok(())
}

/// Propose a governance action. A policy change, unpause, or emergency exit.
/// Approved under the current threshold; a policy change increments the policy
/// version, making older proposals and approvals non-executable.
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
    let treasury = &ctx.accounts.treasury;
    require!(approver_index(treasury, &ctx.accounts.actor.key()).is_some(), TreasuryError::NotAuthorized);
    require!(!treasury.closed, TreasuryError::TreasuryClosed);
    if kind == GovernanceKind::PolicyChange {
        require!(new_threshold >= 1 && (new_threshold as usize) <= new_approver_count as usize, TreasuryError::BadThreshold);
        require!((new_approver_count as usize) <= MAX_APPROVERS, TreasuryError::TooManySigners);
        require!(new_per_payment_limit > 0 && new_daily_limit > 0, TreasuryError::OverPerPaymentLimit);
    }

    let proposal = &mut ctx.accounts.governance;
    proposal.bump = ctx.bumps.governance;
    proposal.treasury = treasury.key();
    proposal.policy_version = treasury.policy_version;
    proposal.kind = kind;
    proposal.proposed_at = Clock::get()?.unix_timestamp;
    proposal.approvals = 0;
    proposal.executed = false;
    proposal.cancelled = false;
    proposal.new_threshold = new_threshold;
    proposal.new_approver_count = new_approver_count;
    proposal.new_approvers = new_approvers;
    proposal.new_per_payment_limit = new_per_payment_limit;
    proposal.new_daily_limit = new_daily_limit;
    proposal.new_recovery = new_recovery;
    Ok(())
}

pub fn approve_governance(ctx: Context<ApproveGovernance>) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.governance;
    let index = approver_index(treasury, &ctx.accounts.approver.key()).ok_or(TreasuryError::NotAuthorized)?;
    require!(proposal.policy_version == treasury.policy_version, TreasuryError::StalePolicy);
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    let bit = 1u16 << index;
    require!(proposal.approvals & bit == 0, TreasuryError::DuplicateApproval);
    proposal.approvals |= bit;
    Ok(())
}

pub fn execute_policy_change(ctx: Context<ExecutePolicyChange>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.governance;
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    require!(proposal.policy_version == treasury.policy_version, TreasuryError::StalePolicy);
    require!(
        proposal.approvals.count_ones() >= treasury.threshold as u32,
        TreasuryError::NotEnoughApprovals
    );

    match proposal.kind {
        GovernanceKind::Unpause => {
            treasury.execution_paused = false;
            emit!(TreasuryUnpaused { treasury: treasury.key() });
        }
        GovernanceKind::PolicyChange => {
            let mut set = [Pubkey::default(); MAX_APPROVERS];
            for (i, a) in proposal.new_approvers.iter().take(proposal.new_approver_count as usize).enumerate() {
                set[i] = *a;
            }
            treasury.approvers = set;
            treasury.approver_count = proposal.new_approver_count;
            treasury.threshold = proposal.new_threshold;
            treasury.per_payment_limit = proposal.new_per_payment_limit;
            treasury.daily_limit = proposal.new_daily_limit;
            treasury.recovery = proposal.new_recovery;
            treasury.policy_version = treasury.policy_version.checked_add(1).ok_or(TreasuryError::MathOverflow)?;
            emit!(PolicyChanged { treasury: treasury.key(), policy_version: treasury.policy_version });
        }
        GovernanceKind::EmergencyExit => {
            return err!(TreasuryError::NotAuthorized);
        }
    }
    proposal.executed = true;
    Ok(())
}

/// Emergency exit: quorum sends the treasury balance to the registered recovery
/// wallet while paused, bypassing the daily/per-payment caps but not quorum.
/// Afterwards the treasury is closed to new payments.
pub fn execute_emergency_exit(ctx: Context<ExecuteEmergencyExit>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let proposal = &mut ctx.accounts.governance;
    require!(proposal.kind == GovernanceKind::EmergencyExit, TreasuryError::NotAuthorized);
    require!(proposal.policy_version == treasury.policy_version, TreasuryError::StalePolicy);
    require!(!proposal.executed, TreasuryError::AlreadyExecuted);
    require!(treasury.execution_paused, TreasuryError::NotPaused);
    require!(
        proposal.approvals.count_ones() >= treasury.threshold as u32,
        TreasuryError::NotEnoughApprovals
    );
    require!(ctx.accounts.recovery_token.owner == treasury.recovery, TreasuryError::WrongRecipient);
    require!(ctx.accounts.recovery_token.mint == treasury.mint, TreasuryError::WrongMint);

    let amount = ctx.accounts.treasury_token.amount;
    let treasury_key = treasury.key();
    let authority_bump = treasury.authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[seeds::TREASURY_AUTHORITY, treasury_key.as_ref(), &[authority_bump]]];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.treasury_token.to_account_info(),
            to: ctx.accounts.recovery_token.to_account_info(),
            authority: ctx.accounts.treasury_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi, amount)?;

    proposal.executed = true;
    treasury.closed = true;
    emit!(EmergencyExitExecuted { treasury: treasury.key(), recovery: treasury.recovery, amount });
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers and contexts
// ---------------------------------------------------------------------------

fn approver_index(treasury: &TreasuryConfig, key: &Pubkey) -> Option<u8> {
    treasury
        .approvers
        .iter()
        .take(treasury.approver_count as usize)
        .position(|a| a == key)
        .map(|i| i as u8)
}

fn is_proposer(treasury: &TreasuryConfig, key: &Pubkey) -> bool {
    treasury
        .proposers
        .iter()
        .take(treasury.proposer_count as usize)
        .any(|p| p == key)
}

#[derive(Accounts)]
#[instruction(entity: Pubkey)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the legal entity this treasury serves, stored as data.
    pub entity: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + TreasuryConfig::INIT_SPACE,
        seeds = [seeds::TREASURY_CONFIG, entity.key().as_ref()],
        bump
    )]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    /// CHECK: PDA authority for the treasury token account.
    #[account(seeds = [seeds::TREASURY_AUTHORITY, treasury.key().as_ref()], bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = treasury_authority,
        seeds = [seeds::TREASURY_TOKEN, treasury.key().as_ref()],
        bump
    )]
    pub treasury_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, constraint = funder_token.owner == funder.key() @ TreasuryError::NotAuthorized)]
    pub funder_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(invoice_key: [u8; 32], revision: u32)]
pub struct ProposePayment<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(mut, has_one = mint @ TreasuryError::WrongMint)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(
        init_if_needed,
        payer = proposer,
        space = 8 + InvoiceSettlement::INIT_SPACE,
        seeds = [seeds::INVOICE_SETTLEMENT, treasury.key().as_ref(), invoice_key.as_ref()],
        bump
    )]
    pub settlement: Account<'info, InvoiceSettlement>,
    #[account(
        init,
        payer = proposer,
        space = 8 + PaymentProposal::INIT_SPACE,
        seeds = [seeds::PAYMENT_PROPOSAL, treasury.key().as_ref(), invoice_key.as_ref(), revision.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, PaymentProposal>,
    /// CHECK: mint account, used only in a has_one check on the treasury.
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApprovePayment<'info> {
    pub approver: Signer<'info>,
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub proposal: Account<'info, PaymentProposal>,
}

#[derive(Accounts)]
pub struct CancelPayment<'info> {
    pub actor: Signer<'info>,
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub proposal: Account<'info, PaymentProposal>,
}

#[derive(Accounts)]
pub struct ExecutePayment<'info> {
    /// Any caller may execute an already eligible payment; the fixed checks
    /// prevent diversion. Kept as a signer so the operation is attributable.
    #[account(mut)]
    pub executor: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub proposal: Account<'info, PaymentProposal>,
    #[account(
        mut,
        seeds = [seeds::INVOICE_SETTLEMENT, treasury.key().as_ref(), proposal.invoice_key.as_ref()],
        bump = settlement.bump,
    )]
    pub settlement: Account<'info, InvoiceSettlement>,
    /// CHECK: PDA authority for the treasury token account.
    #[account(seeds = [seeds::TREASURY_AUTHORITY, treasury.key().as_ref()], bump = treasury.authority_bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = executor,
        space = 8 + DailySpend::INIT_SPACE,
        seeds = [seeds::DAILY_SPEND, treasury.key().as_ref()],
        bump
    )]
    pub daily_spend: Account<'info, DailySpend>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseExecution<'info> {
    pub actor: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
}

#[derive(Accounts)]
#[instruction(kind: GovernanceKind)]
pub struct ProposeGovernance<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(
        init,
        payer = actor,
        space = 8 + GovernanceProposal::INIT_SPACE,
        seeds = [seeds::GOVERNANCE_PROPOSAL, treasury.key().as_ref(), treasury.policy_version.to_le_bytes().as_ref(), &[kind.seed_byte()]],
        bump
    )]
    pub governance: Box<Account<'info, GovernanceProposal>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveGovernance<'info> {
    pub approver: Signer<'info>,
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub governance: Box<Account<'info, GovernanceProposal>>,
}

#[derive(Accounts)]
pub struct ExecutePolicyChange<'info> {
    pub actor: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub governance: Box<Account<'info, GovernanceProposal>>,
}

#[derive(Accounts)]
pub struct ExecuteEmergencyExit<'info> {
    pub actor: Signer<'info>,
    #[account(mut)]
    pub treasury: Box<Account<'info, TreasuryConfig>>,
    #[account(mut, has_one = treasury @ TreasuryError::StaleRevision)]
    pub governance: Box<Account<'info, GovernanceProposal>>,
    /// CHECK: PDA authority for the treasury token account.
    #[account(seeds = [seeds::TREASURY_AUTHORITY, treasury.key().as_ref()], bump = treasury.authority_bump)]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub recovery_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
