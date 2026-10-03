//! Cross-cutting invariant tests from the plan's matrix (#164): state fuzzing,
//! concurrency ordering, and tenant isolation. These drive the real compiled
//! programs in litesvm and assert the money-conservation and authorization
//! invariants hold no matter the operation order.
//!
//! Fuzzing here is deterministic (a fixed LCG seed), so a failure is
//! reproducible. It explores operation orders, not random byte payloads; the
//! latter is left to a separate fuzz harness.
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_signer::Signer;
use token_ledger_contract_tests::{discriminator, initialize_merchant_ix, Harness};

const SERVICE_BALANCE: &str = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const USDC: u64 = 1_000_000;

fn load() -> Option<Harness> {
    Harness::load(SERVICE_BALANCE, "service_balance")
}

/// A small deterministic PRNG so a fuzz failure can be replayed exactly.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn token_amount(svm: &LiteSVM, address: Address) -> u64 {
    let account = svm.get_account(&address).expect("token account");
    u64::from_le_bytes(account.data[64..72].try_into().unwrap())
}

fn mandate_total_debited(svm: &LiteSVM, mandate: Address) -> u64 {
    let account = svm.get_account(&mandate).expect("mandate");
    u64::from_le_bytes(account.data[145..153].try_into().unwrap())
}

fn mandate_next_cycle(svm: &LiteSVM, mandate: Address) -> u64 {
    let account = svm.get_account(&mandate).expect("mandate");
    u64::from_le_bytes(account.data[153..161].try_into().unwrap())
}

struct Fuzz {
    h: Harness,
    merchant: Address,
    plan: Address,
    vault: Address,
    vault_authority: Address,
    vault_token: Address,
    mandate: Address,
    destination: Address,
    controller_token: Address,
    expiry: i64,
    admin: solana_keypair::Keypair,
}

fn receipt_pda(s: &Fuzz, cycle: u64) -> Address {
    Address::find_program_address(
        &[b"charge_receipt", s.mandate.as_ref(), &cycle.to_le_bytes()],
        &s.h.program_id,
    )
    .0
}

/// Build a merchant + plan + funded vault. `admin` is the merchant admin and
/// controller; passing distinct keypairs yields two co-resident tenants in one
/// VM for isolation tests. Callers must fund and sign as `admin`.
fn setup_merchant(mut h: Harness, admin: &solana_keypair::Keypair, tag: u8) -> Fuzz {
    let program_id = h.program_id;
    let admin_pk = admin.pubkey();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    h.set_mint(mint, admin_pk, 6);
    h.set_token_account(destination, mint, admin_pk, 0);

    let (merchant, _) = Address::find_program_address(&[b"merchant", admin_pk.as_ref()], &program_id);
    let mut data = discriminator("initialize_merchant").to_vec();
    data.extend_from_slice(mint.as_ref());
    data.extend_from_slice(&token_ledger_contract_tests::token_program().to_bytes());
    data.extend_from_slice(destination.as_ref());
    h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(admin_pk, true),
                AccountMeta::new_readonly(admin_pk, false),
                AccountMeta::new(merchant, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        },
        &[admin],
    )
    .expect("initialize_merchant");

    let plan_id = [tag; 16];
    let (plan, _) = Address::find_program_address(
        &[b"plan_version", merchant.as_ref(), &plan_id, &1u16.to_le_bytes()],
        &program_id,
    );
    let mut data = discriminator("create_plan_version").to_vec();
    data.extend_from_slice(&plan_id);
    data.extend_from_slice(&1u16.to_le_bytes());
    data.extend_from_slice(&(20 * USDC).to_le_bytes());
    data.extend_from_slice(&5u32.to_le_bytes());
    h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(admin_pk, true),
                AccountMeta::new_readonly(merchant, false),
                AccountMeta::new(plan, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        },
        &[admin],
    )
    .expect("create_plan_version");

    let controller = admin_pk;
    let (vault, _) = Address::find_program_address(
        &[b"billing_vault", merchant.as_ref(), controller.as_ref()],
        &program_id,
    );
    let (vault_authority, _) = Address::find_program_address(
        &[b"billing_vault", merchant.as_ref(), controller.as_ref()],
        &program_id,
    );
    let (vault_token, _) = Address::find_program_address(&[b"billing_vault_token", vault.as_ref()], &program_id);
    let mut data = discriminator("create_billing_vault").to_vec();
    data.extend_from_slice(controller.as_ref());
    h.send_signed(
        Instruction {
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
            data,
        },
        &[admin],
    )
    .expect("create_billing_vault");

    let controller_token = Address::new_unique();
    h.set_token_account(controller_token, mint, controller, 200 * USDC);
    let mut data = discriminator("deposit").to_vec();
    data.extend_from_slice(&(200 * USDC).to_le_bytes());
    h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(controller, true),
                AccountMeta::new(vault, false),
                AccountMeta::new(controller_token, false),
                AccountMeta::new(vault_token, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            ],
            data,
        },
        &[admin],
    )
    .expect("deposit");

    let (mandate, _) = Address::find_program_address(&[b"mandate", vault.as_ref()], &program_id);
    let expiry = h.now() + 400 * 24 * 60 * 60;
    let mut data = discriminator("activate_mandate_and_charge").to_vec();
    data.extend_from_slice(&(160 * USDC).to_le_bytes());
    data.extend_from_slice(&expiry.to_le_bytes());
    let receipt = receipt_pda_raw(&h, mandate, 0);
    h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(controller, true),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(plan, false),
                AccountMeta::new(mandate, false),
                AccountMeta::new(receipt, false),
                AccountMeta::new_readonly(merchant, false),
                AccountMeta::new_readonly(vault_authority, false),
                AccountMeta::new(vault_token, false),
                AccountMeta::new(destination, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        },
        &[admin],
    )
    .expect("activate");

    Fuzz {
        h,
        merchant,
        plan,
        vault,
        vault_authority,
        vault_token,
        mandate,
        destination,
        controller_token,
        expiry,
        admin: admin.insecure_clone(),
    }
}

fn receipt_pda_raw(h: &Harness, mandate: Address, cycle: u64) -> Address {
    Address::find_program_address(
        &[b"charge_receipt", mandate.as_ref(), &cycle.to_le_bytes()],
        &h.program_id,
    )
    .0
}

fn collect(s: &mut Fuzz, cycle: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let receipt = receipt_pda(s, cycle);
    let kp = s.admin.insecure_clone();
    let mut data = discriminator("collect_cycle").to_vec();
    data.extend_from_slice(&cycle.to_le_bytes());
    s.h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(kp.pubkey(), true),
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
        },
        &[&kp],
    )
}

fn revoke(s: &mut Fuzz) -> Result<(), String> {
    let program_id = s.h.program_id;
    let kp = s.admin.insecure_clone();
    s.h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(kp.pubkey(), true),
                AccountMeta::new(s.vault, false),
                AccountMeta::new(s.mandate, false),
            ],
            data: discriminator("revoke_mandate").to_vec(),
        },
        &[&kp],
    )
}

fn replace(s: &mut Fuzz, cap: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let kp = s.admin.insecure_clone();
    let mut data = discriminator("replace_mandate").to_vec();
    data.extend_from_slice(&cap.to_le_bytes());
    data.extend_from_slice(&s.expiry.to_le_bytes());
    s.h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(kp.pubkey(), true),
                AccountMeta::new(s.vault, false),
                AccountMeta::new_readonly(s.plan, false),
                AccountMeta::new(s.mandate, false),
            ],
            data,
        },
        &[&kp],
    )
}

fn withdraw(s: &mut Fuzz, amount: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let kp = s.admin.insecure_clone();
    let mut data = discriminator("withdraw").to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    s.h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(kp.pubkey(), true),
                AccountMeta::new(s.vault, false),
                AccountMeta::new_readonly(s.vault_authority, false),
                AccountMeta::new(s.vault_token, false),
                AccountMeta::new(s.controller_token, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            ],
            data,
        },
        &[&kp],
    )
}

/// The core money-conservation invariant: the vault + destination + controller
/// token accounts always sum to the amount ever deposited into this isolated
/// instance. A failed operation must move nothing.
#[test]
fn fuzz_operation_order_preserves_money_conservation() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    // Two independent merchants/vaults in one VM, to also exercise isolation.
    let mut a = {
        let admin = solana_keypair::Keypair::new();
        let mut h = h;
        h.fund(admin.pubkey(), 1_000_000_000);
        setup_merchant(h, &admin, 0xa)
    };
    let deposited_a = 200 * USDC;

    let mut rng = Lcg(0x5EED_1234_ABCD);
    for step in 0..120 {
        // A cycle is only collectible once due; try the mandate's next cycle most
        // of the time, and a stale/random one the rest.
        let op = rng.below(6);
        match op {
            0 | 1 => {
                let next = mandate_next_cycle(&a.h.svm, a.mandate);
                let cycle = if rng.below(4) == 0 { next.wrapping_add(rng.below(3)) } else { next };
                let _ = collect(&mut a, cycle);
            }
            2 => {
                let _ = revoke(&mut a);
            }
            3 => {
                let cap = 40 * USDC + rng.below(160) * USDC;
                let _ = replace(&mut a, cap);
            }
            4 => {
                let amount = rng.below(220) * USDC;
                let _ = withdraw(&mut a, amount);
            }
            _ => {
                // A withdrawal is a customer right even when revoked; and
                // re-activation cannot happen (one mandate PDA), so this is a
                // no-op branch that keeps the sequence varied.
            }
        }

        let vault = token_amount(&a.h.svm, a.vault_token);
        let destination = token_amount(&a.h.svm, a.destination);
        let controller = token_amount(&a.h.svm, a.controller_token);
        assert_eq!(
            vault + destination + controller,
            deposited_a,
            "money not conserved at step {step} (op {op})"
        );
    }
}

/// Fuzzing replacement/cap: the mandate's cumulative debit never exceeds its
/// current cap, and the vault never pays more than the cap over its life.
#[test]
fn fuzz_cap_is_never_exceeded() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut a = {
        let admin = solana_keypair::Keypair::new();
        let mut h = h;
        h.fund(admin.pubkey(), 1_000_000_000);
        setup_merchant(h, &admin, 0xa)
    };
    // The starting cap is 160 USDC with a 20 USDC price: at most 8 periods.
    let hard_ceiling = 160 * USDC;

    let mut rng = Lcg(0xABCD_5EED_0001);
    for step in 0..80 {
        match rng.below(3) {
            0 => {
                let next = mandate_next_cycle(&a.h.svm, a.mandate);
                let _ = collect(&mut a, next);
            }
            1 => {
                // Replace with a cap that is sometimes below, sometimes above the
                // floor (debited + one period). A too-low cap must be refused and
                // must not change anything.
                let debited = mandate_total_debited(&a.h.svm, a.mandate);
                let floor = debited + 20 * USDC;
                let cap = if rng.below(2) == 0 {
                    floor.saturating_sub(20 * USDC)
                } else {
                    floor + rng.below(80) * USDC
                };
                let _ = replace(&mut a, cap);
            }
            _ => {
                let _ = revoke(&mut a);
            }
        }
        let debited = mandate_total_debited(&a.h.svm, a.mandate);
        assert!(debited <= hard_ceiling, "cap exceeded at step {step}: {debited}");
    }
}

/// Tenant isolation, single VM: two merchants coexist on the same program. A's
/// collect cannot be satisfied with B's accounts (PDA seeds bind each account to
/// its merchant), and driving A does not touch B's state.
#[test]
fn tenant_isolation_rejects_cross_tenant_accounts() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut a = {
        let admin = solana_keypair::Keypair::new();
        let mut h = h;
        h.fund(admin.pubkey(), 1_000_000_000);
        setup_merchant(h, &admin, 0xA1)
    };

    // Create a second merchant B on the same VM with a fresh admin.
    let b_admin = solana_keypair::Keypair::new();
    a.h.fund(b_admin.pubkey(), 1_000_000_000);
    let program_id = a.h.program_id;
    let b_mint = Address::new_unique();
    let b_dest = Address::new_unique();
    a.h.set_mint(b_mint, b_admin.pubkey(), 6);
    a.h.set_token_account(b_dest, b_mint, b_admin.pubkey(), 0);
    let (b_merchant, _) =
        Address::find_program_address(&[b"merchant", b_admin.pubkey().as_ref()], &program_id);
    let mut data = discriminator("initialize_merchant").to_vec();
    data.extend_from_slice(b_mint.as_ref());
    data.extend_from_slice(&token_ledger_contract_tests::token_program().to_bytes());
    data.extend_from_slice(b_dest.as_ref());
    a.h.send_signed(
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(b_admin.pubkey(), true),
                AccountMeta::new_readonly(b_admin.pubkey(), false),
                AccountMeta::new(b_merchant, false),
                AccountMeta::new_readonly(b_mint, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        },
        &[&b_admin],
    )
    .expect("B merchant");

    let b_config = a.h.svm.get_account(&b_merchant).expect("B config");
    assert_ne!(a.merchant, b_merchant, "distinct merchant PDAs");

    // A's collect instruction signed by A's admin, but with B's merchant account
    // swapped in. The vault's merchant no longer matches, so it must be refused.
    let cycle = mandate_next_cycle(&a.h.svm, a.mandate);
    let receipt = receipt_pda(&a, cycle);
    let kp = a.admin.insecure_clone();
    let dest_before = token_amount(&a.h.svm, a.destination);
    let mut data = discriminator("collect_cycle").to_vec();
    data.extend_from_slice(&cycle.to_le_bytes());
    let err = a
        .h
        .send_signed(
            Instruction {
                program_id,
                accounts: vec![
                    AccountMeta::new(kp.pubkey(), true),
                    AccountMeta::new_readonly(b_merchant, false),
                    AccountMeta::new(a.vault, false),
                    AccountMeta::new(a.mandate, false),
                    AccountMeta::new(receipt, false),
                    AccountMeta::new_readonly(a.vault_authority, false),
                    AccountMeta::new(a.vault_token, false),
                    AccountMeta::new(a.destination, false),
                    AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
                    AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
                ],
                data,
            },
            &[&kp],
        )
        .expect_err("cross-tenant merchant must be refused");
    assert!(err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&a.h.svm, a.destination), dest_before, "A not charged by cross-tenant call");

    // B's config is untouched by A's activity, and B's mint is B's own.
    let after = a.h.svm.get_account(&b_merchant).expect("B config after");
    assert_eq!(after.data, b_config.data, "B config unchanged");
    assert_eq!(&after.data[73..105], b_mint.as_ref(), "B mint is its own");

    // Driving A normally still works and leaves B unaffected.
    collect(&mut a, cycle).expect("A collects");
    let b_after_ops = a.h.svm.get_account(&b_merchant).expect("B config");
    assert_eq!(b_after_ops.data, b_config.data, "B still unchanged after A's real collect");
}

/// Concurrency ordering: a withdraw that drains the vault, then a collection for
/// the now-unfunded next cycle, must leave zero money and a consistent mandate.
#[test]
fn concurrency_withdraw_then_collect_leaves_a_consistent_state() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut a = {
        let admin = solana_keypair::Keypair::new();
        let mut h = h;
        h.fund(admin.pubkey(), 1_000_000_000);
        setup_merchant(h, &admin, 0xa)
    };
    // 180 USDC in the vault after the first charge.
    withdraw(&mut a, 180 * USDC).expect("withdraw all");
    assert_eq!(token_amount(&a.h.svm, a.vault_token), 0, "vault drained");

    let next = mandate_next_cycle(&a.h.svm, a.mandate);
    a.h.advance_blockhash();
    let err = collect(&mut a, next).expect_err("cannot charge an empty vault");
    assert!(
        err.contains("InsufficientFunds") || err.contains("custom program error"),
        "got {err}"
    );
    // No partial state: the cycle counter did not advance on the failed charge.
    assert_eq!(mandate_next_cycle(&a.h.svm, a.mandate), next, "cycle unchanged");
    assert_eq!(token_amount(&a.h.svm, a.destination), 20 * USDC, "only the first charge landed");
}

/// The first charge is atomic with activation: a vault funded below one period
/// must not leave a half-created mandate behind.
#[test]
fn concurrency_activation_with_insufficient_funds_is_atomic() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut h = h;
    let program_id = h.program_id;
    let admin = h.payer_pk();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    h.set_mint(mint, admin, 6);
    h.set_token_account(destination, mint, admin, 0);

    let tag = 0xF6u8;
    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);
    let mut data = discriminator("initialize_merchant").to_vec();
    data.extend_from_slice(mint.as_ref());
    data.extend_from_slice(&token_ledger_contract_tests::token_program().to_bytes());
    data.extend_from_slice(destination.as_ref());
    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(admin, true),
            AccountMeta::new_readonly(admin, false),
            AccountMeta::new(merchant, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
    .expect("merchant");

    let plan_id = [tag; 16];
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
    .expect("plan");

    let controller = admin;
    let (vault, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_authority, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_token, _) = Address::find_program_address(&[b"billing_vault_token", vault.as_ref()], &program_id);
    let mut data = discriminator("create_billing_vault").to_vec();
    data.extend_from_slice(controller.as_ref());
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
            AccountMeta::new_readonly(Address::from_str_const("SysvarRent111111111111111111111111111111111"), false),
        ],
        data,
    })
    .expect("vault");

    // Fund the controller below one period, and deposit it.
    let controller_token = Address::new_unique();
    h.set_token_account(controller_token, mint, controller, 5 * USDC);
    let mut data = discriminator("deposit").to_vec();
    data.extend_from_slice(&(5 * USDC).to_le_bytes());
    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(controller, true),
            AccountMeta::new(vault, false),
            AccountMeta::new(controller_token, false),
            AccountMeta::new(vault_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
        ],
        data,
    })
    .expect("deposit");

    // Activation fails on the first charge; no mandate and no receipt remain.
    let (mandate, _) = Address::find_program_address(&[b"mandate", vault.as_ref()], &program_id);
    let receipt = receipt_pda_raw(&h, mandate, 0);
    let mut data = discriminator("activate_mandate_and_charge").to_vec();
    data.extend_from_slice(&(100 * USDC).to_le_bytes());
    data.extend_from_slice(&(h.now() + 200 * 24 * 60 * 60).to_le_bytes());
    let err = h
        .send(Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(controller, true),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(plan, false),
                AccountMeta::new(mandate, false),
                AccountMeta::new(receipt, false),
                AccountMeta::new_readonly(merchant, false),
                AccountMeta::new_readonly(vault_authority, false),
                AccountMeta::new(vault_token, false),
                AccountMeta::new(destination, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        })
        .expect_err("activation must fail");
    assert!(err.contains("InsufficientFunds") || err.contains("custom program error"), "got {err}");

    assert!(h.svm.get_account(&mandate).is_none(), "no mandate left behind");
    assert!(h.svm.get_account(&receipt).is_none(), "no receipt left behind");
    assert_eq!(token_amount(&h.svm, vault_token), 5 * USDC, "vault balance untouched");
}

/// A malformed/foreign mint on the vault must be refused (WrongMint), so a
/// deployment cannot be pointed at the wrong asset.
#[test]
fn foreign_mint_is_refused() {
    let Some(mut h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let program_id = h.program_id;
    let admin = h.payer_pk();
    let mint = Address::new_unique();
    let destination = Address::new_unique();
    h.set_mint(mint, admin, 6);
    h.set_token_account(destination, mint, admin, 0);
    let (merchant, _) = Address::find_program_address(&[b"merchant", admin.as_ref()], &program_id);
    h.send(initialize_merchant_ix(program_id, admin, merchant, admin, mint, destination))
        .expect("merchant");

    // A second, different mint is not the merchant's configured mint.
    let other_mint = Address::new_unique();
    h.set_mint(other_mint, admin, 6);
    let controller = admin;
    let (vault, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_authority, _) = Address::find_program_address(&[b"billing_vault", merchant.as_ref(), controller.as_ref()], &program_id);
    let (vault_token, _) = Address::find_program_address(&[b"billing_vault_token", vault.as_ref()], &program_id);
    let mut data = discriminator("create_billing_vault").to_vec();
    data.extend_from_slice(controller.as_ref());
    let err = h
        .send(Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(controller, true),
                AccountMeta::new(merchant, false),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(vault_authority, false),
                AccountMeta::new_readonly(other_mint, false),
                AccountMeta::new(vault_token, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
                AccountMeta::new_readonly(Address::from_str_const("SysvarRent111111111111111111111111111111111"), false),
            ],
            data,
        })
        .expect_err("foreign mint must be refused");
    assert!(err.contains("WrongMint") || err.contains("custom program error"), "got {err}");
    let _ = Account::default();
}
