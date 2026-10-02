//! Token Ledger — Service Balance.
//!
//! Customers fund a USDC vault and authorize bounded, recurring 30-day
//! subscription charges. They can revoke future billing and withdraw unspent
//! funds at any time, without the merchant. The merchant can never withdraw
//! customer funds, change an existing mandate's destination, or enlarge a
//! customer's allowance.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb");

#[program]
pub mod service_balance {
    use super::*;

    pub fn initialize_merchant(
        ctx: Context<InitializeMerchant>,
        mint: Pubkey,
        token_program: Pubkey,
        destination: Pubkey,
    ) -> Result<()> {
        instructions::initialize_merchant(ctx, mint, token_program, destination)
    }

    pub fn set_collection_pause(ctx: Context<MerchantAdmin>, paused: bool) -> Result<()> {
        instructions::set_collection_pause(ctx, paused)
    }

    pub fn rotate_collector(ctx: Context<MerchantAdmin>, collector: Pubkey) -> Result<()> {
        instructions::rotate_collector(ctx, collector)
    }

    pub fn create_plan_version(
        ctx: Context<CreatePlanVersion>,
        plan_id: [u8; 16],
        version: u16,
        price: u64,
        max_periods: u32,
    ) -> Result<()> {
        instructions::create_plan_version(ctx, plan_id, version, price, max_periods)
    }

    pub fn create_billing_vault(ctx: Context<CreateBillingVault>, controller: Pubkey) -> Result<()> {
        instructions::create_billing_vault(ctx, controller)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    pub fn activate_mandate_and_charge(
        ctx: Context<ActivateMandate>,
        max_total_debit: u64,
        authorization_expiry: i64,
    ) -> Result<()> {
        instructions::activate_mandate_and_charge(ctx, max_total_debit, authorization_expiry)
    }

    pub fn collect_cycle(ctx: Context<CollectCycle>) -> Result<()> {
        instructions::collect_cycle(ctx)
    }

    pub fn revoke_mandate(ctx: Context<ControllerOnVault>) -> Result<()> {
        instructions::revoke_mandate(ctx)
    }

    pub fn replace_mandate(
        ctx: Context<ReplaceMandate>,
        max_total_debit: u64,
        authorization_expiry: i64,
    ) -> Result<()> {
        instructions::replace_mandate(ctx, max_total_debit, authorization_expiry)
    }
}
// force Fri Oct  2 13:49:48 IST 2026
