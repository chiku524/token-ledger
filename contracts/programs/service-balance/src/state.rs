//! Account state for the Service Balance (billing) program.
//!
//! Amounts are stored in USDC base units (6 decimals) using checked integer
//! arithmetic. Nothing here uses floating point.

use anchor_lang::prelude::*;

/// Merchant administration. Holds no customer funds; it names the fixed mint,
/// the collector that may trigger collection, and a pause switch. It can never
/// withdraw customer funds or change the destination of an existing mandate.
#[account]
#[derive(InitSpace)]
pub struct MerchantConfig {
    pub bump: u8,
    /// Governance authority that administers the merchant config.
    pub admin: Pubkey,
    /// Operational key allowed to trigger a collection. Rotatable.
    pub collector: Pubkey,
    /// The one USDC mint this deployment accepts.
    pub mint: Pubkey,
    /// The SPL Token program (legacy) this deployment uses.
    pub token_program: Pubkey,
    /// Fixed merchant destination for collected funds.
    pub destination: Pubkey,
    /// When true, new collections are refused. Withdrawals are never blocked.
    pub collection_paused: bool,
}

/// An immutable plan version. A new price or term is a new version; an existing
/// mandate keeps pointing at the version it signed.
#[account]
#[derive(InitSpace)]
pub struct PlanVersion {
    pub bump: u8,
    pub merchant: Pubkey,
    /// Opaque plan id the merchant controls.
    pub plan_id: [u8; 16],
    pub version: u16,
    /// Fixed price per 30-day period, in USDC base units.
    pub price: u64,
    /// Period length in seconds (30 days).
    pub period_seconds: i64,
    /// How many periods a mandate may be charged in total.
    pub max_periods: u32,
}

/// A customer's billing vault. The vault authority is a PDA of this program;
/// the vault's token account is owned by that PDA. Only the controller may
/// deposit, sign a mandate, revoke or withdraw.
#[account]
#[derive(InitSpace)]
pub struct BillingVault {
    pub bump: u8,
    pub authority_bump: u8,
    pub merchant: Pubkey,
    /// The single controller wallet for this vault (version one).
    #[max_len(1)]
    pub controller: Pubkey,
    pub mint: Pubkey,
    /// The vault's USDC token account.
    pub token_account: Pubkey,
    /// Monotonic generation, incremented on mandate replacement.
    pub generation: u64,
}

/// A signed, bounded authorization. Its terms are fixed at signing; a replacement
/// is a new mandate with a higher generation.
#[account]
#[derive(InitSpace)]
pub struct Mandate {
    pub bump: u8,
    pub vault: Pubkey,
    pub plan: Pubkey,
    pub merchant: Pubkey,
    /// Fixed price copied from the plan version at signing.
    pub price: u64,
    pub period_seconds: i64,
    /// Lifetime cap on cumulative debits, in base units.
    pub max_total_debit: u64,
    pub start_time: i64,
    /// After this instant, no new coverage may extend.
    pub authorization_expiry: i64,
    /// Cumulative amount debited so far.
    pub total_debited: u64,
    /// The next cycle number expected on a collection.
    pub next_cycle: u64,
    /// Coverage end time already paid for.
    pub paid_through: i64,
    pub revoked: bool,
    pub generation: u64,
}

/// A receipt for one collected cycle. Kept as a durable, addressable record so
/// a missed event log does not lose the fact of a charge.
#[account]
#[derive(InitSpace)]
pub struct ChargeReceipt {
    pub bump: u8,
    pub mandate: Pubkey,
    pub cycle: u64,
    pub amount: u64,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub collected_at: i64,
}
