//! Placeholder crate for program-level integration tests (litesvm).
//!
//! The `litesvm` feature is intentionally not enabled by default: its 0.17
//! dependency tree does not compile against the current solana crate versions.
//! The pure invariant tests in `programs/shared` are the gate today. See
//! Cargo.toml for the details and how to enable this once upstream settles.

#[cfg(feature = "litesvm")]
compile_error!(
    "The litesvm feature is not wired yet; see contracts/tests/Cargo.toml. \
     Use `anchor test` with the local validator in the meantime."
);
