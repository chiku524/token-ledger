//! Service Balance integration tests on the in-process litesvm VM. No devnet,
//! no network: these run in CI and can warp the clock for time-based cases.
//!
//! The SPL mint/token fixtures are written directly into the VM (litesvm's own
//! pattern) and the instructions run against the real compiled program. The
//! time-warp cases (expiry, next-cycle due) are only testable here, not on devnet.
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_signer::Signer;
use token_ledger_contract_tests::{discriminator, initialize_merchant_ix, Harness};

const SERVICE_BALANCE: &str = "GgYegKVx47vYApyQijG6g4k2pAGGJ6ub9DUhKUE4gZYo";
const USDC: u64 = 1_000_000;
const THIRTY_DAYS: i64 = 30 * 24 * 60 * 60;

fn load() -> Option<Harness> {
    Harness::load(SERVICE_BALANCE, "service_balance")
}

/// A merchant plus a mint and a funded controller, with the vault created and
/// 200 USDC deposited. Returns the addresses a test needs to drive mandates.
struct Setup {
    h: Harness,
    merchant: Address,
    plan: Address,
    vault: Address,
    vault_authority: Address,
    vault_token: Address,
    mandate: Address,
    destination: Address,
    controller: Address,
    controller_token: Address,
    mint: Address,
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

    let controller = admin;
    let (vault, _) = Address::find_program_address(
        &[b"billing_vault", merchant.as_ref(), controller.as_ref()],
        &program_id,
    );
    let (vault_authority, _) = Address::find_program_address(
        &[b"billing_vault", merchant.as_ref(), controller.as_ref()],
        &program_id,
    );
    let (vault_token, _) = Address::find_program_address(&[b"billing_vault_token", vault.as_ref()], &program_id);

    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(controller, true),
            AccountMeta::new(merchant, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(vault_authority, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(vault_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            AccountMeta::new_readonly(
                Address::from_str_const("SysvarRent111111111111111111111111111111111"),
                false,
            ),
        ],
        data: {
            let mut d = discriminator("create_billing_vault").to_vec();
            d.extend_from_slice(controller.as_ref());
            d
        },
    })
    .expect("create_billing_vault");

    // The program creates the vault token account via `init`; this is the
    // controller's own funded token account used to deposit.
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
        merchant,
        plan,
        vault,
        vault_authority,
        vault_token,
        mandate,
        destination,
        controller,
        controller_token,
        mint,
    }
}

/// The receipt PDA for a mandate and cycle.
fn receipt_pda(s: &Setup, cycle: u64) -> Address {
    Address::find_program_address(
        &[b"charge_receipt", s.mandate.as_ref(), &cycle.to_le_bytes()],
        &s.h.program_id,
    )
    .0
}

/// Activate a mandate and take the first charge atomically.
fn activate(s: &mut Setup, cap: u64, expiry: i64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("activate_mandate_and_charge").to_vec();
    data.extend_from_slice(&cap.to_le_bytes());
    data.extend_from_slice(&expiry.to_le_bytes());
    let receipt = receipt_pda(s, 0);
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.controller, true),
            AccountMeta::new(s.vault, false),
            AccountMeta::new_readonly(s.plan, false),
            AccountMeta::new(s.mandate, false),
            AccountMeta::new(receipt, false),
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

/// The collector triggers the next cycle. The collector is the payer here.
fn collect(s: &mut Setup) -> Result<(), String> {
    let cycle = mandate_next_cycle(&s.h.svm, s.mandate);
    collect_cycle(s, cycle)
}

/// Collect a specific cycle number, so a test can also send a stale one.
fn collect_cycle(s: &mut Setup, cycle: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let receipt = receipt_pda(s, cycle);
    let mut data = discriminator("collect_cycle").to_vec();
    data.extend_from_slice(&cycle.to_le_bytes());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.h.payer_pk(), true),
            AccountMeta::new_readonly(s.merchant, false),
            AccountMeta::new(s.vault, false),
            AccountMeta::new(s.mandate, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new_readonly(s.vault_authority, false),
            AccountMeta::new(s.vault_token, false),
            AccountMeta::new(s.destination, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
}

fn revoke(s: &mut Setup) -> Result<(), String> {
    let program_id = s.h.program_id;
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.controller, true),
            AccountMeta::new(s.vault, false),
            AccountMeta::new(s.mandate, false),
        ],
        data: discriminator("revoke_mandate").to_vec(),
    })
}

fn replace(s: &mut Setup, cap: u64, expiry: i64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("replace_mandate").to_vec();
    data.extend_from_slice(&cap.to_le_bytes());
    data.extend_from_slice(&expiry.to_le_bytes());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.controller, true),
            AccountMeta::new(s.vault, false),
            AccountMeta::new_readonly(s.plan, false),
            AccountMeta::new(s.mandate, false),
        ],
        data,
    })
}

fn withdraw(s: &mut Setup, amount: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("withdraw").to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.controller, true),
            AccountMeta::new(s.vault, false),
            AccountMeta::new_readonly(s.vault_authority, false),
            AccountMeta::new(s.vault_token, false),
            AccountMeta::new(s.controller_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
        ],
        data,
    })
}

/// Admin pauses new collections. Withdrawals must still work.
fn pause_collection(s: &mut Setup, paused: bool) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("set_collection_pause").to_vec();
    data.push(paused as u8);
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.h.payer_pk(), true),
            AccountMeta::new(s.merchant, false),
        ],
        data,
    })
}

/// Admin rotates the operational collector key.
fn rotate_collector(s: &mut Setup, new_collector: Address) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("rotate_collector").to_vec();
    data.extend_from_slice(new_collector.as_ref());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.h.payer_pk(), true),
            AccountMeta::new(s.merchant, false),
        ],
        data,
    })
}

/// Trigger a collection that pays a caller-supplied destination account, so a
/// test can try to substitute the merchant's fixed destination.
fn collect_to(s: &mut Setup, destination: Address) -> Result<(), String> {
    let program_id = s.h.program_id;
    let cycle = mandate_next_cycle(&s.h.svm, s.mandate);
    let receipt = receipt_pda(s, cycle);
    let mut data = discriminator("collect_cycle").to_vec();
    data.extend_from_slice(&cycle.to_le_bytes());
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.h.payer_pk(), true),
            AccountMeta::new_readonly(s.merchant, false),
            AccountMeta::new(s.vault, false),
            AccountMeta::new(s.mandate, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new_readonly(s.vault_authority, false),
            AccountMeta::new(s.vault_token, false),
            AccountMeta::new(destination, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
}

/// An authorization expiry `days` from the current VM clock.
fn expiry_in(s: &Setup, days: i64) -> i64 {
    s.h.now() + days * 86_400
}

fn token_amount(svm: &LiteSVM, address: Address) -> u64 {
    let account = svm.get_account(&address).expect("token account");
    let data: &[u8] = &account.data;
    // SPL token account: amount is a u64 at offset 64.
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

/// The mandate account layout: 8 discriminator + bump 1 + vault 32 + plan 32 +
/// merchant 32 + price 8 + period 8 + max_total_debit 8 + start 8 + expiry 8,
/// so `total_debited` is a u64 at offset 145 and `next_cycle` follows at 153.
fn mandate_total_debited(svm: &LiteSVM, mandate: Address) -> u64 {
    let account = svm.get_account(&mandate).expect("mandate");
    u64::from_le_bytes(account.data[145..153].try_into().unwrap())
}

fn mandate_next_cycle(svm: &LiteSVM, mandate: Address) -> u64 {
    let account = svm.get_account(&mandate).expect("mandate");
    u64::from_le_bytes(account.data[153..161].try_into().unwrap())
}

/// The receipt account layout: 8 discriminator + bump 1 + mandate 32 + vault 32
/// + cycle 8 + amount 8 + coverage_start 8 + coverage_end 8 + collected_at 8,
/// so `amount` is a u64 at offset 81.
fn receipt_amount(svm: &LiteSVM, mandate: Address, cycle: u64, program_id: Address) -> Option<u64> {
    let receipt = Address::find_program_address(
        &[b"charge_receipt", mandate.as_ref(), &cycle.to_le_bytes()],
        &program_id,
    )
    .0;
    svm.get_account(&receipt)
        .map(|a| u64::from_le_bytes(a.data[81..89].try_into().unwrap()))
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
    h.set_mint(mint, admin, 6);
    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);

    h.send(initialize_merchant_ix(program_id, admin, merchant, collector, mint, destination))
        .expect("initialize_merchant");

    let account: Account = h.svm.get_account(&merchant).expect("merchant exists");
    assert_eq!(account.owner, program_id);
    assert_eq!(&account.data[9..41], admin.as_ref(), "admin stored");
    assert_eq!(&account.data[73..105], mint.as_ref(), "mint stored");
}

#[test]
fn initialize_merchant_refuses_wrong_decimals() {
    let Some(mut h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let program_id = h.program_id;
    let admin = h.payer_pk();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    // A 9-decimal mint is not the configured 6-decimal USDC scale.
    h.set_mint(mint, admin, 9);
    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);

    let err = h
        .send(initialize_merchant_ix(program_id, admin, merchant, admin, mint, destination))
        .expect_err("wrong decimals must be refused");
    assert!(err.contains("WrongMintDecimals") || err.contains("custom program error"), "got {err}");
    assert!(h.svm.get_account(&merchant).is_none(), "no merchant created");
}

#[test]
fn deposit_moves_usdc_into_the_vault() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let s = set_up(h);
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 200 * USDC, "vault holds the deposit");
    assert_eq!(token_amount(&s.h.svm, s.controller_token), 0, "controller spent the deposit");
}

#[test]
fn activate_charges_the_first_period_atomically() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = s.h.now() + 200 * 24 * 60 * 60;
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 180 * USDC, "first charge debited 20");
    assert_eq!(token_amount(&s.h.svm, s.destination), 20 * USDC, "merchant received 20");
    assert_eq!(mandate_total_debited(&s.h.svm, s.mandate), 20 * USDC, "one period debited");
    assert_eq!(mandate_next_cycle(&s.h.svm, s.mandate), 1, "cycle advanced");
}

#[test]
fn activate_refuses_coverage_past_expiry() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let now = s.h.now();
    let err = activate(&mut s, 100 * USDC, now + THIRTY_DAYS - 60).expect_err("should refuse");
    assert!(err.contains("CoveragePastExpiry") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 200 * USDC, "no charge on a failed activation");
}

#[test]
fn collect_charges_the_next_cycle_and_stops_at_the_cap() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    // A cap of two periods: the activation charge plus exactly one more.
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 40 * USDC, expiry).expect("activate");
    collect(&mut s).expect("second cycle");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 160 * USDC, "two charges debited 40");
    assert_eq!(token_amount(&s.h.svm, s.destination), 40 * USDC, "merchant received 40");
    assert_eq!(mandate_next_cycle(&s.h.svm, s.mandate), 2, "two cycles collected");

    s.h.advance_blockhash();
    let err = collect(&mut s).expect_err("cap should be exhausted");
    assert!(err.contains("CapExceeded") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 160 * USDC, "no charge past the cap");
}

#[test]
fn revoked_mandate_refuses_collection() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    revoke(&mut s).expect("revoke");
    let err = collect(&mut s).expect_err("revoked mandate must not collect");
    assert!(err.contains("MandateRevoked") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 180 * USDC, "no charge after revoke");
}

#[test]
fn withdrawal_needs_no_merchant_and_returns_the_balance() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    // Collected funds are the merchant's; the unspent balance is the customer's.
    withdraw(&mut s, 180 * USDC).expect("withdraw");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 0, "vault drained");
    assert_eq!(token_amount(&s.h.svm, s.controller_token), 180 * USDC, "controller refunded");
}

#[test]
fn replacement_preserves_paid_through_and_carries_the_cap() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    replace(&mut s, 100 * USDC, expiry).expect("replace");
    // The cap carries over: 20 already debited, one more period fits.
    collect(&mut s).expect("collect after replace");
    assert_eq!(mandate_total_debited(&s.h.svm, s.mandate), 40 * USDC, "cap carried over");

    // A new cap below (debited + one period) is refused.
    let err = replace(&mut s, 20 * USDC, expiry).expect_err("cap floor");
    assert!(err.contains("CapExceeded") || err.contains("custom program error"), "got {err}");
}

#[test]
fn expired_authorization_refuses_a_fresh_cycle() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    // Expiry 35 days out: the first 30-day period fits, a later one cannot.
    let now = s.h.now();
    activate(&mut s, 100 * USDC, now + 35 * 24 * 60 * 60).expect("activate");
    s.h.warp_clock(now + 34 * 24 * 60 * 60);
    let err = collect(&mut s).expect_err("coverage would pass the expiry");
    assert!(err.contains("CoveragePastExpiry") || err.contains("custom program error"), "got {err}");
}

#[test]
fn collection_pause_stops_charges_but_not_withdrawal() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    pause_collection(&mut s, true).expect("pause");
    let err = collect(&mut s).expect_err("paused collection");
    assert!(err.contains("CollectionPaused") || err.contains("custom program error"), "got {err}");
    // The customer's exit is never blocked by a pause.
    withdraw(&mut s, 180 * USDC).expect("withdraw while paused");
    assert_eq!(token_amount(&s.h.svm, s.controller_token), 180 * USDC, "exit honoured");
}

#[test]
fn a_substituted_destination_is_refused() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let now = s.h.now();
    activate(&mut s, 100 * USDC, now + 200 * 24 * 60 * 60).expect("activate");

    // An attacker supplies their own token account as the destination; the
    // program must require the merchant's fixed destination.
    let attacker = Address::new_unique();
    s.h.set_token_account(attacker, s.mint, s.h.payer_pk(), 0);
    let err = collect_to(&mut s, attacker).expect_err("substituted destination");
    assert!(err.contains("WrongMint") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, attacker), 0, "attacker received nothing");
    assert_eq!(token_amount(&s.h.svm, s.destination), 20 * USDC, "merchant unchanged");
}

#[test]
fn rotated_collector_replaces_the_old_key() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");

    // A new collector key is a funded signer that can drive collection.
    let new_collector = solana_keypair::Keypair::new();
    s.h.fund(new_collector.pubkey(), 100_000_000);
    rotate_collector(&mut s, new_collector.pubkey()).expect("rotate");

    // Drive collection signed by the new collector, not the payer.
    let program_id = s.h.program_id;
    let cycle = mandate_next_cycle(&s.h.svm, s.mandate);
    let receipt = receipt_pda(&s, cycle);
    let mut data = discriminator("collect_cycle").to_vec();
    data.extend_from_slice(&cycle.to_le_bytes());
    let ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(new_collector.pubkey(), true),
            AccountMeta::new_readonly(s.merchant, false),
            AccountMeta::new(s.vault, false),
            AccountMeta::new(s.mandate, false),
            AccountMeta::new(receipt, false),
            AccountMeta::new_readonly(s.vault_authority, false),
            AccountMeta::new(s.vault_token, false),
            AccountMeta::new(s.destination, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    };
    s.h.send_signed(ix, &[&new_collector]).expect("new collector collects");
    assert_eq!(token_amount(&s.h.svm, s.destination), 40 * USDC, "new collector charged cycle 2");
}

#[test]
fn a_replayed_cycle_is_refused_by_the_receipt_seed() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let expiry = expiry_in(&s, 200);
    activate(&mut s, 100 * USDC, expiry).expect("activate");
    collect(&mut s).expect("cycle 1");

    // The receipt for cycle 1 is a durable record with the charged amount.
    assert_eq!(
        receipt_amount(&s.h.svm, s.mandate, 0, s.h.program_id),
        Some(20 * USDC),
        "cycle 0 receipt written"
    );
    assert_eq!(
        receipt_amount(&s.h.svm, s.mandate, 1, s.h.program_id),
        Some(20 * USDC),
        "cycle 1 receipt written"
    );

    // Replaying a cycle the mandate has already advanced past is refused by the
    // counter before any transfer, even with a distinct receipt PDA.
    s.h.advance_blockhash();
    let err = collect_cycle(&mut s, 1).expect_err("replayed cycle");
    assert!(err.contains("WrongCycle") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.destination), 40 * USDC, "no extra charge from replay");
    assert_eq!(token_amount(&s.h.svm, s.vault_token), 160 * USDC, "vault unchanged by replay");
}
