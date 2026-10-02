//! Account state for the Accounts Payable treasury program.
//!
//! Approvals use a bitmap tied to an immutable `policy_version`, so duplicate
//! signatures cannot increase the vote count and a stale-policy approval can
//! never execute. Amounts are USDC base units with checked arithmetic.

use anchor_lang::prelude::*;

use token_ledger_shared::{MAX_APPROVERS, MAX_PROPOSERS};

/// Stable identity for an invoice. The backend enforces normalized supplier +
/// reference uniqueness; the chain only guarantees one settlement per key.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct InvoiceKey(pub [u8; 32]);

impl anchor_lang::Space for InvoiceKey {
    const INIT_SPACE: usize = 32;
}

impl AsRef<[u8]> for InvoiceKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Fixed policy for one treasury. Changes require a governance proposal under
/// the current threshold; Token Ledger support has no override.
#[account]
#[derive(InitSpace)]
pub struct TreasuryConfig {
    pub bump: u8,
    pub authority_bump: u8,
    pub entity: Pubkey,
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub policy_version: u64,
    /// How many distinct approvals are required.
    pub threshold: u8,
    pub approver_count: u8,
    pub proposer_count: u8,
    pub approvers: [Pubkey; MAX_APPROVERS],
    pub proposers: [Pubkey; MAX_PROPOSERS],
    /// Per-payment cap in base units.
    pub per_payment_limit: u64,
    /// Fixed UTC-day spending cap in base units.
    pub daily_limit: u64,
    /// Maximum lifetime of a payment proposal, in seconds.
    pub max_proposal_lifetime: i64,
    pub execution_paused: bool,
    /// A recovery wallet a quorum may exit to while paused.
    pub recovery: Pubkey,
    /// Set once an emergency exit has run; no further payments are allowed.
    pub closed: bool,
}

/// A payment proposal. Immutable fields are bound at creation; an edit is a new
/// revision that invalidates old approvals.
#[account]
#[derive(InitSpace)]
pub struct PaymentProposal {
    pub bump: u8,
    pub treasury: Pubkey,
    pub invoice_key: InvoiceKey,
    pub revision: u32,
    pub policy_version: u64,
    /// Recipient owner; its canonical token account is validated at execution.
    pub recipient_owner: Pubkey,
    pub mint: Pubkey,
    pub gross_amount: u64,
    pub created_at: i64,
    pub expires_at: i64,
    /// Bitmap of approvers who have approved (index into treasury.approvers).
    pub approvals: u16,
    pub cancelled: bool,
    pub executed: bool,
}

/// Persistent paid marker for one invoice identity. Created and marked paid
/// atomically with the transfer, so the same invoice cannot settle twice.
#[account]
#[derive(InitSpace)]
pub struct InvoiceSettlement {
    pub bump: u8,
    pub treasury: Pubkey,
    pub invoice_key: InvoiceKey,
    pub active_revision: u32,
    pub paid: bool,
}

/// A governance action: a policy change, an unpause, or an emergency exit.
#[account]
#[derive(InitSpace)]
pub struct GovernanceProposal {
    pub bump: u8,
    pub treasury: Pubkey,
    pub policy_version: u64,
    pub kind: GovernanceKind,
    pub proposed_at: i64,
    pub approvals: u16,
    pub executed: bool,
    pub cancelled: bool,
    /// New policy fields, used when `kind` is a policy change.
    pub new_threshold: u8,
    pub new_approver_count: u8,
    pub new_approvers: [Pubkey; MAX_APPROVERS],
    pub new_per_payment_limit: u64,
    pub new_daily_limit: u64,
    pub new_recovery: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum GovernanceKind {
    PolicyChange,
    Unpause,
    EmergencyExit,
}

/// A per-day spending counter. `day` is the fixed UTC day index; a new day
/// resets the counter.
#[account]
#[derive(InitSpace)]
pub struct DailySpend {
    pub bump: u8,
    pub treasury: Pubkey,
    pub day: i64,
    pub spent: u64,
}
