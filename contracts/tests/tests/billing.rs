//! Service Balance integration tests on the in-process litesvm VM. No devnet,
//! no network: these run in CI and can warp the clock for time-based cases.
//!
//! Status: the harness and `initialize_merchant` run against the real compiled
//! program. The funded flow (deposit, activate, collect) is written but ignored:
//! constructing an SPL mint/token account in litesvm hits solana-crate version
//! friction (the SPL interface crates use `solana_pubkey` v3 while litesvm uses
//! `solana_address` v2), so the fixtures need more work. The equivalent flows are
//! already proven on devnet in contracts/scripts/*.ts.
use litesvm::LiteSVM;
use solana_address::Address;
use solana_account::Account;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use token_ledger_contract_tests::{discriminator, initialize_merchant_ix, Harness};

const SERVICE_BALANCE: &str = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const USDC: u64 = 1_000_000;
const THIRTY_DAYS: i64 = 30 * 24 * 60 * 60;

fn load() -> Option<Harness> {
    Harness::load(SERVICE_BALANCE, "service_balance")
}

/// A merchant (admin/collector/destination) plus a mint and a funded controller,
/// with the vault created and 200 USDC deposited. Returns the setup so a test can
/// drive mandate operations.
struct Setup {
    h: Harness,
    admin: Address,
    merchant: Address,
    plan: Address,
    vault: Address,
    vault_authority: Address,
    vault_token: Address,
    mandate: Address,
    destination: Address,
    controller: Address,
    controller_token: Address,
}

fn set_up(mut h: Harness) -> Setup {
    let program_id = h.program_id;
    let admin = h.payer_pk();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    h.set_mint(mint, admin, 6);
    h.set_token_account(destination, mint, admin, 0);

    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);
    h.send(initialize_merchant_ix(program_id, admin, merchant, admin, mint, destination))
        .expect("initialize_merchant");

    let plan_id = [7u8; 16];
    let (plan, _) = Address::find_program_address(
        &[b"plan_version", merchant.as_ref(), &plan_id, &1u16.to_le_bytes()],
        &program_id,
    );
    let mut data = discriminator("create_plan_version").to_vec();
    data.extend_from_slice(&plan_id);
    data.extend_from_slice(&1u16.to_le_bytes());
    data.extend_from_slice(&(20 * USDC).to_le_bytes());
    data.extend_from_slice(&5u32.to_le_bytes());
    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(admin, true),
            AccountMeta::new_readonly(merchant, false),
            AccountMeta::new(plan, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
    .expect("create_plan_version");

    // Vault authority and token account are PDAs; write the token account directly
    // (the vault authority is the program PDA that signs transfers).
    let controller = admin;
    let (vault, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_authority, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_token, _) = Address::find_program_address(&[b"billing_vault_token", vault.as_ref()], &program_id);

    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(controller, true),
            AccountMeta::new(merchant, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new(vault_token, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            AccountMeta::new_readonly(solana_address::Address::from_str_const("SysvarRent111111111111111111111111111111111"), false),
        ],
        data: {
            // create_billing_vault takes the controller pubkey as its argument.
            let mut d = discriminator("create_billing_vault").to_vec();
            d.extend_from_slice(controller.as_ref());
            d
        },
    })
    .expect("create_billing_vault");

    // The program creates the vault token account via `init`, so it is not
    // pre-created here. Fund the controller and deposit through the program.
    let controller_token = Address::new_unique();
    h.set_token_account(controller_token, mint, controller, 200 * USDC);
    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(controller, true),
            AccountMeta::new(vault, false),
            AccountMeta::new(controller_token, false),
            AccountMeta::new(vault_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
        ],
        data: {
            let mut d = discriminator("deposit").to_vec();
            d.extend_from_slice(&(200 * USDC).to_le_bytes());
            d
        },
    })
    .expect("deposit");

    let (mandate, _) = Address::find_program_address(&[b"mandate", vault.as_ref()], &program_id);
    Setup {
        h,
        admin,
        merchant,
        plan,
        vault,
        vault_authority,
        vault_token,
        mandate,
        destination,
        controller,
        controller_token,
    }
}

fn activate(s: &mut Setup, cap: u64, expiry: i64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("activate_mandate_and_charge").to_vec();
    data.extend_from_slice(&cap.to_le_bytes());
    data.extend_from_slice(&expiry.to_le_bytes());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.controller, true),
            AccountMeta::new(s.vault, false),
            AccountMeta::new_readonly(s.plan, false),
            AccountMeta::new(s.mandate, false),
            AccountMeta::new_readonly(s.merchant, false),
            AccountMeta::new_readonly(s.vault_authority, false),
            AccountMeta::new(s.vault_token, false),
            AccountMeta::new(s.destination, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
}

fn token_amount(svm: &LiteSVM, address: Address) -> u64 {
    let account = svm.get_account(&address).expect("token account");
    let data: &[u8] = &account.data;
    // SPL token account: amount is a u64 at offset 64.
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

#[test]
fn initialize_merchant_creates_the_config() {
    let Some(mut h) = load() else {
        eprintln!("skip: build the program first (cargo-build-sbf)");
        return;
    };
    let program_id = h.program_id;
    let admin = h.payer_pk();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    let collector = Address::new_unique();
    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);

    h.send(initialize_merchant_ix(program_id, admin, merchant, collector, mint, destination))
        .expect("initialize_merchant");

    let account: Account = h.svm.get_account(&merchant).expect("merchant exists");
    assert_eq!(account.owner, program_id);
    assert_eq!(&account.data[9..41], admin.as_ref(), "admin stored");
    assert_eq!(&account.data[73..105], mint.as_ref(), "mint stored");
}

#[test]
#[ignore = "harness WIP: funded flow needs mint/token setup; see the note in tests/tests/billing.rs"]
fn deposit_moves_usdc_into_the_vault() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 200 * USDC, "vault holds the deposit");
    assert_eq!(token_amount(&s.h.svm, s.controller_token), 0, "controller spent the deposit");
}

#[test]
#[ignore = "harness WIP: funded flow needs mint/token setup; see the note in tests/tests/billing.rs"]
fn activate_charges_the_first_period_atomically() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = (s.h.svm.get_sysvar::<solana_clock::Clock>().unix_timestamp) + 200 * 24 * 60 * 60;
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 180 * USDC, "first charge debited 20");
    assert_eq!(token_amount(&s.h.svm, s.destination), 20 * USDC, "merchant received 20");

    let mandate = s.h.svm.get_account(&s.mandate).expect("mandate");
    // total_debited is a u64 at a known offset; assert through the vault effect.
    assert!(!mandate.data.is_empty());
}

#[test]
#[ignore = "harness WIP: funded flow needs mint/token setup; see the note in tests/tests/billing.rs"]
fn activate_refuses_coverage_past_expiry() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let now = s.h.svm.get_sysvar::<solana_clock::Clock>().unix_timestamp;
    let err = activate(&mut s, 100 * USDC, now + THIRTY_DAYS - 60).expect_err("should refuse");
    assert!(err.contains("CoveragePastExpiry") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 200 * USDC, "no charge on a failed activation");
}
