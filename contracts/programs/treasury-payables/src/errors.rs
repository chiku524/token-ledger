use anchor_lang::prelude::*;

#[error_code]
pub enum TreasuryError {
    #[msg("The caller is not authorized for this action.")]
    NotAuthorized,
    #[msg("The approval threshold is invalid.")]
    BadThreshold,
    #[msg("Too many approvers or proposers.")]
    TooManySigners,
    #[msg("This signer has already approved.")]
    DuplicateApproval,
    #[msg("The policy version does not match the current treasury policy.")]
    StalePolicy,
    #[msg("The proposal is not the active revision for this invoice.")]
    StaleRevision,
    #[msg("The proposal has expired.")]
    Expired,
    #[msg("The proposal has been cancelled.")]
    Cancelled,
    #[msg("The proposal has already executed.")]
    AlreadyExecuted,
    #[msg("Execution is paused.")]
    Paused,
    #[msg("The amount exceeds the per-payment limit.")]
    OverPerPaymentLimit,
    #[msg("The amount exceeds the remaining daily limit.")]
    OverDailyLimit,
    #[msg("The recipient token account is not the approved owner's canonical account.")]
    WrongRecipient,
    #[msg("The mint or token program does not match the treasury.")]
    WrongMint,
    #[msg("The mint decimals do not match the configured USDC decimals.")]
    WrongMintDecimals,
    #[msg("Insufficient treasury balance.")]
    InsufficientFunds,
    #[msg("The invoice has already settled.")]
    InvoiceAlreadyPaid,
    #[msg("An arithmetic overflow occurred.")]
    MathOverflow,
    #[msg("The treasury is closed.")]
    TreasuryClosed,
    #[msg("Not enough approvals.")]
    NotEnoughApprovals,
    #[msg("The treasury is not paused.")]
    NotPaused,
}
