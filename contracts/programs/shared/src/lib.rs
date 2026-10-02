//! Shared, dependency-light helpers for the Token Ledger Solana programs.
//!
//! Domain-separated PDA seeds and a few pure predicates live here so both
//! programs derive the same addresses and agree on the same rules. Nothing here
//! moves funds or holds authority; each program keeps its own fund-moving
//! authority and vault.

use anchor_lang::prelude::*;

/// Seed prefixes. Opaque, fixed-size, and domain-separated so a seed from one
/// account type can never collide with another.
pub mod seeds {
    /// Merchant administration for the billing program.
    pub const MERCHANT: &[u8] = b"merchant";
    /// An immutable plan version under a merchant.
    pub const PLAN_VERSION: &[u8] = b"plan_version";
    /// A customer's billing vault.
    pub const BILLING_VAULT: &[u8] = b"billing_vault";
    /// The token account owned by a billing vault's authority.
    pub const BILLING_VAULT_TOKEN: &[u8] = b"billing_vault_token";
    /// A mandate for a billing vault generation.
    pub const MANDATE: &[u8] = b"mandate";
    /// A receipt for a collected cycle.
    pub const CHARGE_RECEIPT: &[u8] = b"charge_receipt";

    /// Treasury configuration for a company.
    pub const TREASURY_CONFIG: &[u8] = b"treasury_config";
    /// The program authority that owns a treasury's token account.
    pub const TREASURY_AUTHORITY: &[u8] = b"treasury_authority";
    /// The treasury USDC token account.
    pub const TREASURY_TOKEN: &[u8] = b"treasury_token";
    /// A payment proposal under a treasury.
    pub const PAYMENT_PROPOSAL: &[u8] = b"payment_proposal";
    /// Persistent paid marker for one invoice identity.
    pub const INVOICE_SETTLEMENT: &[u8] = b"invoice_settlement";
    /// A governance proposal (policy change, unpause, emergency exit).
    pub const GOVERNANCE_PROPOSAL: &[u8] = b"governance_proposal";
    /// Per-day spending counter for a treasury.
    pub const DAILY_SPEND: &[u8] = b"daily_spend";
}

/// The fixed 30-day billing period, in seconds. Version-one plans are 30-day
/// periods; calendar-month plans are a later, explicitly scheduled addition.
pub const THIRTY_DAYS_SECONDS: i64 = 30 * 24 * 60 * 60;

/// The number of seconds in a UTC day, used for the fixed daily spend window.
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Bounded signer set. The plan caps approvers at 10.
pub const MAX_APPROVERS: usize = 10;
/// Bounded proposer set.
pub const MAX_PROPOSERS: usize = 10;

/// The fixed UTC day index for a timestamp: `floor(unix / 86_400)`.
pub fn day_index(unix_timestamp: i64) -> i64 {
    unix_timestamp.div_euclid(SECONDS_PER_DAY)
}

/// Whether a proposed coverage interval fits within a mandate's authorization
/// expiry. Coverage starts at the later of now and prior paid-through, and ends
/// one period later; that end must not exceed the mandate expiry.
pub fn coverage_within_expiry(now: i64, paid_through: i64, expiry: i64) -> bool {
    let start = if now > paid_through { now } else { paid_through };
    match start.checked_add(THIRTY_DAYS_SECONDS) {
        Some(end) => end <= expiry,
        None => false,
    }
}

#[cfg(test)]
mod tests;
