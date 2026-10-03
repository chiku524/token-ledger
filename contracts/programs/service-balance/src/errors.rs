use anchor_lang::prelude::*;

#[error_code]
pub enum BillingError {
    #[msg("The caller is not the merchant admin.")]
    NotAdmin,
    #[msg("The caller is not the authorized collector.")]
    NotCollector,
    #[msg("The caller is not the billing vault controller.")]
    NotController,
    #[msg("Collection is paused.")]
    CollectionPaused,
    #[msg("The mandate is revoked.")]
    MandateRevoked,
    #[msg("The mandate has expired.")]
    MandateExpired,
    #[msg("The cycle number does not match the mandate's expected next cycle.")]
    WrongCycle,
    #[msg("The amount does not equal the signed plan price.")]
    WrongAmount,
    #[msg("The authorization cap would be exceeded.")]
    CapExceeded,
    #[msg("The mandate is not yet due for another collection.")]
    NotYetDue,
    #[msg("New coverage would end after the mandate authorization expiry.")]
    CoveragePastExpiry,
    #[msg("Insufficient token balance.")]
    InsufficientFunds,
    #[msg("The mint or token program does not match the merchant config.")]
    WrongMint,
    #[msg("The mint decimals do not match the configured USDC decimals.")]
    WrongMintDecimals,
    #[msg("An arithmetic overflow occurred.")]
    MathOverflow,
    #[msg("The vault is not associated with this merchant.")]
    WrongMerchant,
    #[msg("The token account is not owned by the vault authority.")]
    WrongTokenAccount,
}
