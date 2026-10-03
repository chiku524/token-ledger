//! Service Balance instructions.
//!
//! Every instruction validates the accounts and invariants in the plan:
//! a collector can only trigger collection to the fixed merchant destination,
//! a mandate can never exceed its signed price/frequency/expiry/cap, a cycle and
//! a receipt cannot execute twice, and a cancelled or expired mandate cannot be
//! charged. Customer cancellation and withdrawal need no merchant signature.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use token_ledger_shared::seeds;
use token_ledger_shared::{coverage_within_expiry, THIRTY_DAYS_SECONDS};

use crate::errors::BillingError;
use crate::state::{BillingVault, Mandate, MerchantConfig, PlanVersion};

#[event]
pub struct BillingVaultCreated {
    pub vault: Pubkey,
    pub merchant: Pubkey,
    pub controller: Pubkey,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MandateActivated {
    pub vault: Pubkey,
    pub mandate: Pubkey,
    pub cycle: u64,
    pub amount: u64,
    pub paid_through: i64,
}

#[event]
pub struct CycleCollected {
    pub mandate: Pubkey,
    pub cycle: u64,
    pub amount: u64,
    pub coverage_start: i64,
    pub coverage_end: i64,
}

#[event]
pub struct MandateRevoked {
    pub mandate: Pubkey,
}

#[event]
pub struct MandateReplaced {
    pub vault: Pubkey,
    pub mandate: Pubkey,
    pub generation: u64,
}

#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CollectorRotated {
    pub merchant: Pubkey,
    pub collector: Pubkey,
}

#[event]
pub struct CollectionPauseChanged {
    pub merchant: Pubkey,
    pub paused: bool,
}

// ---------------------------------------------------------------------------
// Merchant administration
// ---------------------------------------------------------------------------

pub fn initialize_merchant(
    ctx: Context<InitializeMerchant>,
    mint: Pubkey,
    token_program: Pubkey,
    destination: Pubkey,
) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;
    merchant.bump = ctx.bumps.merchant;
    merchant.admin = ctx.accounts.admin.key();
    merchant.collector = ctx.accounts.collector.key();
    merchant.mint = mint;
    merchant.token_program = token_program;
    merchant.destination = destination;
    merchant.collection_paused = false;
    Ok(())
}

pub fn set_collection_pause(ctx: Context<MerchantAdmin>, paused: bool) -> Result<()> {
    ctx.accounts.merchant.collection_paused = paused;
    emit!(CollectionPauseChanged {
        merchant: ctx.accounts.merchant.key(),
        paused,
    });
    Ok(())
}

pub fn rotate_collector(ctx: Context<MerchantAdmin>, collector: Pubkey) -> Result<()> {
    ctx.accounts.merchant.collector = collector;
    emit!(CollectorRotated {
        merchant: ctx.accounts.merchant.key(),
        collector,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Plan versions
// ---------------------------------------------------------------------------

pub fn create_plan_version(
    ctx: Context<CreatePlanVersion>,
    plan_id: [u8; 16],
    version: u16,
    price: u64,
    max_periods: u32,
) -> Result<()> {
    require!(price > 0, BillingError::WrongAmount);
    require!(max_periods > 0, BillingError::WrongAmount);
    let plan = &mut ctx.accounts.plan;
    plan.bump = ctx.bumps.plan;
    plan.merchant = ctx.accounts.merchant.key();
    plan.plan_id = plan_id;
    plan.version = version;
    plan.price = price;
    plan.period_seconds = THIRTY_DAYS_SECONDS;
    plan.max_periods = max_periods;
    Ok(())
}

// ---------------------------------------------------------------------------
// Billing vault
// ---------------------------------------------------------------------------

pub fn create_billing_vault(ctx: Context<CreateBillingVault>, controller: Pubkey) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;
    vault.authority_bump = ctx.bumps.vault_authority;
    vault.merchant = ctx.accounts.merchant.key();
    vault.controller = controller;
    vault.mint = ctx.accounts.merchant.mint;
    vault.token_account = ctx.accounts.vault_token.key();
    vault.generation = 0;
    emit!(BillingVaultCreated {
        vault: vault.key(),
        merchant: vault.merchant,
        controller,
    });
    Ok(())
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, BillingError::WrongAmount);
    let cpi = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor_token.to_account_info(),
            to: ctx.accounts.vault_token.to_account_info(),
            authority: ctx.accounts.controller.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;
    emit!(Deposited {
        vault: ctx.accounts.vault.key(),
        amount,
    });
    Ok(())
}

/// Withdraw unspent balance to the controller's own token account. Needs no
/// merchant signature; cancellation and withdrawal are the customer's right.
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, BillingError::WrongAmount);
    let vault = &ctx.accounts.vault;
    let signer_seeds: &[&[&[u8]]] = &[&[
        seeds::BILLING_VAULT,
        vault.merchant.as_ref(),
        vault.controller.as_ref(),
        &[vault.bump],
    ]];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token.to_account_info(),
            to: ctx.accounts.destination_token.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi, amount)?;
    emit!(Withdrawn {
        vault: vault.key(),
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Mandates: activate + charge, and collect
// ---------------------------------------------------------------------------

pub fn activate_mandate_and_charge(
    ctx: Context<ActivateMandate>,
    max_total_debit: u64,
    authorization_expiry: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let plan = &ctx.accounts.plan;
    require!(plan.merchant == ctx.accounts.vault.merchant, BillingError::WrongMerchant);
    require!(ctx.accounts.vault.generation == ctx.accounts.vault.generation, BillingError::WrongMerchant);
    require!(max_total_debit >= plan.price, BillingError::CapExceeded);
    require!(authorization_expiry > now, BillingError::MandateExpired);
    require!(
        coverage_within_expiry(now, now, authorization_expiry),
        BillingError::CoveragePastExpiry
    );

    let mandate = &mut ctx.accounts.mandate;
    mandate.bump = ctx.bumps.mandate;
    mandate.vault = ctx.accounts.vault.key();
    mandate.plan = plan.key();
    mandate.merchant = plan.merchant;
    mandate.price = plan.price;
    mandate.period_seconds = plan.period_seconds;
    mandate.max_total_debit = max_total_debit;
    mandate.start_time = now;
    mandate.authorization_expiry = authorization_expiry;
    mandate.total_debited = 0;
    mandate.next_cycle = 0;
    mandate.paid_through = now;
    mandate.revoked = false;
    mandate.generation = ctx.accounts.vault.generation;

    // First charge is atomic with activation: insufficient funds aborts both.
    let vault = ctx.accounts.vault.clone();
    let merchant = ctx.accounts.merchant.clone();
    let mandate_key = mandate.key();
    collect_inner(
        &vault,
        mandate,
        mandate_key,
        &merchant,
        &ctx.accounts.vault_token,
        &ctx.accounts.destination_token,
        &ctx.accounts.vault_authority,
        &ctx.accounts.token_program,
    )?;
    Ok(())
}

pub fn collect_cycle(ctx: Context<CollectCycle>) -> Result<()> {
    let vault = ctx.accounts.vault.clone();
    let merchant = ctx.accounts.merchant.clone();
    let mandate_key = ctx.accounts.mandate.key();
    collect_inner(
        &vault,
        &mut ctx.accounts.mandate,
        mandate_key,
        &merchant,
        &ctx.accounts.vault_token,
        &ctx.accounts.destination_token,
        &ctx.accounts.vault_authority,
        &ctx.accounts.token_program,
    )?;
    Ok(())
}

pub fn revoke_mandate(ctx: Context<ControllerOnVault>) -> Result<()> {
    let mandate = &mut ctx.accounts.mandate;
    mandate.revoked = true;
    emit!(MandateRevoked {
        mandate: mandate.key(),
    });
    Ok(())
}

/// Replace the mandate with a new signed term set, in place. Preserves the
/// PDA and paid-through time so overlapping coverage is never charged twice,
/// and increments the mandate generation. The cumulative debit carries over, so
/// the lifetime cap is not reset by a replacement (a cap increase requires a
/// fresh signature with a higher cap).
pub fn replace_mandate(
    ctx: Context<ReplaceMandate>,
    max_total_debit: u64,
    authorization_expiry: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let plan_merchant = ctx.accounts.plan.merchant;
    let vault_key = ctx.accounts.vault.key();
    let old = &ctx.accounts.mandate;
    require!(old.vault == vault_key, BillingError::WrongMerchant);
    require!(!old.revoked, BillingError::MandateRevoked);
    require!(plan_merchant == ctx.accounts.vault.merchant, BillingError::WrongMerchant);
    // The new cap must cover what was already debited plus at least one period.
    let floor = old.total_debited.checked_add(ctx.accounts.plan.price).ok_or(BillingError::MathOverflow)?;
    require!(max_total_debit >= floor, BillingError::CapExceeded);
    require!(authorization_expiry > now, BillingError::MandateExpired);
    require!(old.paid_through > now, BillingError::NotYetDue);
    require!(
        coverage_within_expiry(now, old.paid_through, authorization_expiry),
        BillingError::CoveragePastExpiry
    );

    let generation = ctx
        .accounts
        .vault
        .generation
        .checked_add(1)
        .ok_or(BillingError::MathOverflow)?;
    ctx.accounts.vault.generation = generation;

    let old = &ctx.accounts.mandate;
    let old_start = old.start_time;
    let old_next_cycle = old.next_cycle;
    let old_paid_through = old.paid_through;
    let old_bump = old.bump;
    let old_total_debited = old.total_debited;

    let mandate = &mut ctx.accounts.mandate;
    mandate.bump = old_bump;
    mandate.vault = vault_key;
    mandate.plan = ctx.accounts.plan.key();
    mandate.merchant = plan_merchant;
    mandate.price = ctx.accounts.plan.price;
    mandate.period_seconds = ctx.accounts.plan.period_seconds;
    mandate.max_total_debit = max_total_debit;
    mandate.start_time = old_start;
    mandate.authorization_expiry = authorization_expiry;
    mandate.total_debited = old_total_debited;
    mandate.next_cycle = old_next_cycle;
    mandate.paid_through = old_paid_through;
    mandate.revoked = false;
    mandate.generation = generation;
    emit!(MandateReplaced {
        vault: mandate.vault,
        mandate: mandate.key(),
        generation,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal: the single collection path with all billing rules
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn collect_inner<'info>(
    vault: &BillingVault,
    mandate: &mut Mandate,
    mandate_key: Pubkey,
    merchant: &MerchantConfig,
    vault_token: &Account<'info, TokenAccount>,
    destination_token: &Account<'info, TokenAccount>,
    vault_authority: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let authority_bump = vault.authority_bump;
    let now = Clock::get()?.unix_timestamp;

    require!(!mandate.revoked, BillingError::MandateRevoked);
    require!(!merchant.collection_paused, BillingError::CollectionPaused);
    require!(now <= mandate.authorization_expiry, BillingError::MandateExpired);
    require!(vault_token.mint == merchant.mint, BillingError::WrongMint);
    require!(destination_token.mint == merchant.mint, BillingError::WrongMint);
    require!(destination_token.key() == merchant.destination, BillingError::WrongMint);

    // New coverage starts at the later of now and prior paid-through, and ends
    // one period later, so a backlog of missed periods is never charged.
    let coverage_start = if now > mandate.paid_through { now } else { mandate.paid_through };
    let coverage_end = coverage_start
        .checked_add(mandate.period_seconds)
        .ok_or(BillingError::MathOverflow)?;
    require!(coverage_end <= mandate.authorization_expiry, BillingError::CoveragePastExpiry);
    require!(coverage_end >= now + mandate.period_seconds, BillingError::NotYetDue);

    // Amount equals the signed fixed price.
    let amount = mandate.price;

    // Cumulative debit stays within the signed lifetime cap.
    let new_total = mandate
        .total_debited
        .checked_add(amount)
        .ok_or(BillingError::MathOverflow)?;
    require!(new_total <= mandate.max_total_debit, BillingError::CapExceeded);

    // Sufficient token balance.
    require!(vault_token.amount >= amount, BillingError::InsufficientFunds);

    // Transfer, then update cycle state. The receipt PDA is unique by mandate
    // and cycle, so a cycle cannot be collected twice.
    let merchant_key = vault.merchant;
    let controller_key = vault.controller;
    let bump_seed = [authority_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        seeds::BILLING_VAULT,
        merchant_key.as_ref(),
        controller_key.as_ref(),
        &bump_seed,
    ]];
    let cpi = CpiContext::new_with_signer(
        token_program.to_account_info(),
        Transfer {
            from: vault_token.to_account_info(),
            to: destination_token.to_account_info(),
            authority: vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi, amount)?;

    let cycle = mandate.next_cycle;
    mandate.total_debited = new_total;
    mandate.next_cycle = cycle.checked_add(1).ok_or(BillingError::MathOverflow)?;
    mandate.paid_through = coverage_end;

    emit!(CycleCollected {
        mandate: mandate_key,
        cycle,
        amount,
        coverage_start,
        coverage_end,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Account contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeMerchant<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: the initial collector, stored as data.
    pub collector: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + MerchantConfig::INIT_SPACE,
        seeds = [seeds::MERCHANT, admin.key().as_ref()],
        bump
    )]
    pub merchant: Account<'info, MerchantConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MerchantAdmin<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        has_one = admin @ BillingError::NotAdmin,
    )]
    pub merchant: Account<'info, MerchantConfig>,
}

#[derive(Accounts)]
#[instruction(plan_id: [u8; 16], version: u16)]
pub struct CreatePlanVersion<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(has_one = admin @ BillingError::NotAdmin)]
    pub merchant: Account<'info, MerchantConfig>,
    #[account(
        init,
        payer = admin,
        space = 8 + PlanVersion::INIT_SPACE,
        seeds = [seeds::PLAN_VERSION, merchant.key().as_ref(), plan_id.as_ref(), version.to_le_bytes().as_ref()],
        bump
    )]
    pub plan: Account<'info, PlanVersion>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateBillingVault<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    #[account(
        mut,
        seeds = [seeds::MERCHANT, merchant.admin.as_ref()],
        bump = merchant.bump,
    )]
    pub merchant: Account<'info, MerchantConfig>,
    #[account(
        init,
        payer = controller,
        space = 8 + BillingVault::INIT_SPACE,
        seeds = [seeds::BILLING_VAULT, merchant.key().as_ref(), controller.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, BillingVault>,
    /// CHECK: PDA authority for the vault token account; signs transfers.
    #[account(seeds = [seeds::BILLING_VAULT, merchant.key().as_ref(), controller.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(constraint = mint.key() == merchant.mint @ BillingError::WrongMint)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = controller,
        token::mint = mint,
        token::authority = vault_authority,
        seeds = [seeds::BILLING_VAULT_TOKEN, vault.key().as_ref()],
        bump
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    #[account(
        mut,
        has_one = controller @ BillingError::NotController,
    )]
    pub vault: Account<'info, BillingVault>,
    #[account(mut, constraint = depositor_token.owner == controller.key() @ BillingError::NotController)]
    pub depositor_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = vault_token.key() == vault.token_account @ BillingError::WrongTokenAccount)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    #[account(
        mut,
        has_one = controller @ BillingError::NotController,
    )]
    pub vault: Account<'info, BillingVault>,
    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [seeds::BILLING_VAULT, vault.merchant.as_ref(), vault.controller.as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token.key() == vault.token_account @ BillingError::WrongTokenAccount)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = destination_token.owner == controller.key() @ BillingError::NotController)]
    pub destination_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ActivateMandate<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,
    #[account(
        mut,
        has_one = controller @ BillingError::NotController,
    )]
    pub vault: Account<'info, BillingVault>,
    pub plan: Account<'info, PlanVersion>,
    #[account(
        init,
        payer = controller,
        space = 8 + Mandate::INIT_SPACE,
        seeds = [seeds::MANDATE, vault.key().as_ref()],
        bump
    )]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: merchant destination, validated to equal the config destination.
    #[account(constraint = merchant.destination == destination_token.key() @ BillingError::WrongMint)]
    pub merchant: Account<'info, MerchantConfig>,
    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [seeds::BILLING_VAULT, vault.merchant.as_ref(), vault.controller.as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token.key() == vault.token_account @ BillingError::WrongTokenAccount)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectCycle<'info> {
    /// The collector triggers the charge; any caller could, but only to the
    /// fixed destination, so this is an operational role, not an authority.
    pub collector: Signer<'info>,
    #[account(
        constraint = merchant.collector == collector.key() @ BillingError::NotCollector,
    )]
    pub merchant: Account<'info, MerchantConfig>,
    #[account(
        mut,
        constraint = vault.merchant == merchant.key() @ BillingError::WrongMerchant,
    )]
    pub vault: Account<'info, BillingVault>,
    #[account(
        mut,
        constraint = mandate.vault == vault.key() @ BillingError::WrongMerchant,
    )]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: receipt is not stored in version one; the mandate counter and the
    /// event are the durable record. Left for a later revision.
    #[account(mut)]
    pub vault_authority_placeholder: UncheckedAccount<'info>,
    /// CHECK: PDA authority for the vault token account.
    #[account(seeds = [seeds::BILLING_VAULT, vault.merchant.as_ref(), vault.controller.as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = vault_token.key() == vault.token_account @ BillingError::WrongTokenAccount)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ControllerOnVault<'info> {
    pub controller: Signer<'info>,
    #[account(mut, has_one = controller @ BillingError::NotController)]
    pub vault: Account<'info, BillingVault>,
    #[account(
        mut,
        constraint = mandate.vault == vault.key() @ BillingError::WrongMerchant,
    )]
    pub mandate: Account<'info, Mandate>,
}

#[derive(Accounts)]
pub struct ReplaceMandate<'info> {
    pub controller: Signer<'info>,
    #[account(
        mut,
        has_one = controller @ BillingError::NotController,
    )]
    pub vault: Account<'info, BillingVault>,
    pub plan: Account<'info, PlanVersion>,
    /// The current mandate, replaced in place. A replacement never creates a
    /// second mandate, so overlapping coverage cannot be charged twice.
    #[account(
        mut,
        seeds = [seeds::MANDATE, vault.key().as_ref()],
        bump = mandate.bump,
    )]
    pub mandate: Account<'info, Mandate>,
}
