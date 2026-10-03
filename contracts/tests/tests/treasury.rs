//! Accounts Payable treasury integration tests on the in-process litesvm VM.
//! No devnet, no network: these run in CI and can warp the clock to test the
//! fixed UTC-day cap reset and proposal expiry that devnet cannot.
//!
//! The same rules the devnet script proves (quorum, duplicate approvals, one
//! settlement per invoice, per-payment and daily caps) are asserted here, plus
//! the governance and emergency-exit paths.
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use token_ledger_contract_tests::{discriminator, Harness};

const TREASURY_PAYABLES: &str = "33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs";
const USDC: u64 = 1_000_000;

fn load() -> Option<Harness> {
    Harness::load(TREASURY_PAYABLES, "treasury_payables")
}

struct Setup {
    h: Harness,
    entity: Address,
    mint: Address,
    treasury: Address,
    treasury_authority: Address,
    treasury_token: Address,
    approvers: [Keypair; 3],
    recipient: Keypair,
    recipient_token: Address,
    recovery_token: Address,
}

fn set_up(mut h: Harness) -> Setup {
    let program_id = h.program_id;
    let payer = h.payer_pk();
    let mint = Address::new_unique();
    h.set_mint(mint, payer, 6);

    // Three approvers, threshold 2, the payer proposes/executes. The recovery
    // wallet is the payer, so it needs a recovery token account too.
    let approvers = [Keypair::new(), Keypair::new(), Keypair::new()];
    // Approvers pay rent for the governance PDAs they create, so fund them.
    for a in &approvers {
        h.fund(a.pubkey(), 100_000_000);
    }
    let recipient = Keypair::new();
    let recipient_token = Address::new_unique();
    h.set_token_account(recipient_token, mint, recipient.pubkey(), 0);
    let recovery_token = Address::new_unique();
    h.set_token_account(recovery_token, mint, payer, 0);

    let entity = Address::new_unique();
    let (treasury, _) =
        Address::find_program_address(&[b"treasury_config", entity.as_ref()], &program_id);
    let (treasury_authority, _) =
        Address::find_program_address(&[b"treasury_authority", treasury.as_ref()], &program_id);
    let (treasury_token, _) =
        Address::find_program_address(&[b"treasury_token", treasury.as_ref()], &program_id);

    let mut data = discriminator("initialize_treasury").to_vec();
    data.extend_from_slice(entity.as_ref());
    data.extend_from_slice(mint.as_ref());
    data.extend_from_slice(&token_ledger_contract_tests::token_program().to_bytes());
    data.push(2u8); // threshold
    data.extend_from_slice(&3u32.to_le_bytes());
    for a in &approvers {
        data.extend_from_slice(a.pubkey().as_ref());
    }
    data.extend_from_slice(&1u32.to_le_bytes());
    data.extend_from_slice(payer.as_ref());
    data.extend_from_slice(&(500 * USDC).to_le_bytes()); // per payment
    data.extend_from_slice(&(1000 * USDC).to_le_bytes()); // per day
    data.extend_from_slice(&3600i64.to_le_bytes()); // proposal lifetime
    data.extend_from_slice(payer.as_ref()); // recovery

    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(entity, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new_readonly(treasury_authority, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(treasury_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            AccountMeta::new_readonly(
                Address::from_str_const("SysvarRent111111111111111111111111111111111"),
                false,
            ),
        ],
        data,
    })
    .expect("initialize_treasury");

    // Fund the treasury with 5000 USDC from the payer's token account.
    let funder_token = Address::new_unique();
    h.set_token_account(funder_token, mint, payer, 5000 * USDC);
    let mut data = discriminator("deposit").to_vec();
    data.extend_from_slice(&(5000 * USDC).to_le_bytes());
    h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(treasury, false),
            AccountMeta::new(funder_token, false),
            AccountMeta::new(treasury_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
        ],
        data,
    })
    .expect("deposit");

    Setup {
        h,
        entity,
        mint,
        treasury,
        treasury_authority,
        treasury_token,
        approvers,
        recipient,
        recipient_token,
        recovery_token,
    }
}

fn proposal_pda(s: &Setup, invoice_key: &[u8; 32], revision: u32) -> Address {
    let mut seeds: Vec<&[u8]> = vec![b"payment_proposal", s.treasury.as_ref(), invoice_key];
    let rev = revision.to_le_bytes();
    seeds.push(&rev);
    Address::find_program_address(&seeds, &s.h.program_id).0
}

fn settlement_pda(s: &Setup, invoice_key: &[u8; 32]) -> Address {
    Address::find_program_address(
        &[b"invoice_settlement", s.treasury.as_ref(), invoice_key],
        &s.h.program_id,
    )
    .0
}

fn daily_spend_pda(s: &Setup) -> Address {
    Address::find_program_address(&[b"daily_spend", s.treasury.as_ref()], &s.h.program_id).0
}

fn propose(s: &mut Setup, invoice_key: [u8; 32], revision: u32, amount: u64) -> Result<(), String> {
    let program_id = s.h.program_id;
    let mut data = discriminator("propose_payment").to_vec();
    data.extend_from_slice(&invoice_key);
    data.extend_from_slice(&revision.to_le_bytes());
    data.extend_from_slice(s.recipient.pubkey().as_ref());
    data.extend_from_slice(&amount.to_le_bytes());
    let settlement = settlement_pda(s, &invoice_key);
    let proposal = proposal_pda(s, &invoice_key, revision);
    s.h.send(Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(s.h.payer_pk(), true),
            AccountMeta::new(s.treasury, false),
            AccountMeta::new(settlement, false),
            AccountMeta::new(proposal, false),
            AccountMeta::new_readonly(s.mint, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data,
    })
}

fn approve(s: &mut Setup, invoice_key: [u8; 32], revision: u32, approver: usize) -> Result<(), String> {
    let kp = s.approvers[approver].insecure_clone();
    let proposal = proposal_pda(s, &invoice_key, revision);
    let ix = Instruction {
        program_id: s.h.program_id,
        accounts: vec![
            AccountMeta::new_readonly(kp.pubkey(), true),
            AccountMeta::new_readonly(s.treasury, false),
            AccountMeta::new(proposal, false),
        ],
        data: discriminator("approve_payment").to_vec(),
    };
    s.h.send_signed(ix, &[&kp])
}

fn execute(s: &mut Setup, invoice_key: [u8; 32], revision: u32) -> Result<(), String> {
    let proposal = proposal_pda(s, &invoice_key, revision);
    s.h.send(Instruction {
        program_id: s.h.program_id,
        accounts: vec![
            AccountMeta::new(s.h.payer_pk(), true),
            AccountMeta::new(s.treasury, false),
            AccountMeta::new(proposal, false),
            AccountMeta::new(settlement_pda(s, &invoice_key), false),
            AccountMeta::new_readonly(s.treasury_authority, false),
            AccountMeta::new(s.treasury_token, false),
            AccountMeta::new(s.recipient_token, false),
            AccountMeta::new(daily_spend_pda(s), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
            AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
        ],
        data: discriminator("execute_payment").to_vec(),
    })
}

fn pause(s: &mut Setup, approver: usize) -> Result<(), String> {
    let kp = s.approvers[approver].insecure_clone();
    s.h.send_signed(
        Instruction {
            program_id: s.h.program_id,
            accounts: vec![
                AccountMeta::new_readonly(kp.pubkey(), true),
                AccountMeta::new(s.treasury, false),
            ],
            data: discriminator("pause_execution").to_vec(),
        },
        &[&kp],
    )
}

/// GovernanceKind seed bytes: PolicyChange=0, Unpause=1, EmergencyExit=2.
fn governance_pda(s: &Setup, kind: u8) -> Address {
    Address::find_program_address(
        &[
            b"governance_proposal",
            s.treasury.as_ref(),
            &1u64.to_le_bytes(),
            &[kind],
        ],
        &s.h.program_id,
    )
    .0
}

/// Propose a governance action. New-policy fields are only read for a policy
/// change; the others ignore them.
#[allow(clippy::too_many_arguments)]
fn propose_governance(
    s: &mut Setup,
    proposer: usize,
    kind: u8,
    new_threshold: u8,
    new_approver_count: u8,
    new_approvers: [Address; 10],
    per_payment: u64,
    daily: u64,
    recovery: Address,
) -> Result<(), String> {
    let kp = s.approvers[proposer].insecure_clone();
    let governance = governance_pda(s, kind);
    let mut data = discriminator("propose_governance").to_vec();
    data.push(kind);
    data.push(new_threshold);
    data.push(new_approver_count);
    for a in &new_approvers {
        data.extend_from_slice(a.as_ref());
    }
    data.extend_from_slice(&per_payment.to_le_bytes());
    data.extend_from_slice(&daily.to_le_bytes());
    data.extend_from_slice(recovery.as_ref());
    s.h.send_signed(
        Instruction {
            program_id: s.h.program_id,
            accounts: vec![
                AccountMeta::new(kp.pubkey(), true),
                AccountMeta::new_readonly(s.treasury, false),
                AccountMeta::new(governance, false),
                AccountMeta::new_readonly(token_ledger_contract_tests::system_program(), false),
            ],
            data,
        },
        &[&kp],
    )
}

fn approve_governance(s: &mut Setup, approver: usize, kind: u8) -> Result<(), String> {
    let kp = s.approvers[approver].insecure_clone();
    let governance = governance_pda(s, kind);
    s.h.send_signed(
        Instruction {
            program_id: s.h.program_id,
            accounts: vec![
                AccountMeta::new_readonly(kp.pubkey(), true),
                AccountMeta::new_readonly(s.treasury, false),
                AccountMeta::new(governance, false),
            ],
            data: discriminator("approve_governance").to_vec(),
        },
        &[&kp],
    )
}

fn execute_policy_change(s: &mut Setup, kind: u8) -> Result<(), String> {
    let governance = governance_pda(s, kind);
    s.h.send(Instruction {
        program_id: s.h.program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.h.payer_pk(), true),
            AccountMeta::new(s.treasury, false),
            AccountMeta::new(governance, false),
        ],
        data: discriminator("execute_policy_change").to_vec(),
    })
}

fn execute_emergency_exit(s: &mut Setup) -> Result<(), String> {
    let governance = governance_pda(s, 2);
    s.h.send(Instruction {
        program_id: s.h.program_id,
        accounts: vec![
            AccountMeta::new_readonly(s.h.payer_pk(), true),
            AccountMeta::new(s.treasury, false),
            AccountMeta::new(governance, false),
            AccountMeta::new_readonly(s.treasury_authority, false),
            AccountMeta::new(s.treasury_token, false),
            AccountMeta::new(s.recovery_token, false),
            AccountMeta::new_readonly(token_ledger_contract_tests::token_program(), false),
        ],
        data: discriminator("execute_emergency_exit").to_vec(),
    })
}

fn token_amount(svm: &LiteSVM, address: Address) -> u64 {
    let account = svm.get_account(&address).expect("token account");
    u64::from_le_bytes(account.data[64..72].try_into().unwrap())
}

#[test]
fn initialize_creates_a_policy_bound_treasury() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first (cargo-build-sbf)");
        return;
    };
    let s = set_up(h);
    let account: Account = s.h.svm.get_account(&s.treasury).expect("treasury");
    assert_eq!(account.owner, s.h.program_id);
    assert_eq!(&account.data[10..42], s.entity.as_ref(), "entity stored");
    assert_eq!(&account.data[42..74], s.mint.as_ref(), "mint stored");
    assert_eq!(account.data[114], 2, "threshold stored");
    assert_eq!(token_amount(&s.h.svm, s.treasury_token), 5000 * USDC, "funded");
}

#[test]
fn quorum_is_required_and_duplicate_approvals_do_not_count() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [3u8; 32];
    propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
    approve(&mut s, invoice, 1, 0).expect("first approval");

    s.h.advance_blockhash();
    let err = execute(&mut s, invoice, 1).expect_err("one of two is below quorum");
    assert!(err.contains("NotEnoughApprovals") || err.contains("custom program error"), "got {err}");

    s.h.advance_blockhash();
    let err = approve(&mut s, invoice, 1, 0).expect_err("duplicate approval");
    assert!(err.contains("DuplicateApproval") || err.contains("custom program error"), "got {err}");

    approve(&mut s, invoice, 1, 1).expect("second distinct approval");
    execute(&mut s, invoice, 1).expect("quorum reached");
    assert_eq!(token_amount(&s.h.svm, s.recipient_token), 500 * USDC, "supplier paid");
    assert_eq!(token_amount(&s.h.svm, s.treasury_token), 4500 * USDC, "treasury debited");
}

#[test]
fn an_invoice_settles_only_once() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [4u8; 32];
    propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
    approve(&mut s, invoice, 1, 0).expect("approve a0");
    approve(&mut s, invoice, 1, 1).expect("approve a1");
    execute(&mut s, invoice, 1).expect("execute");

    s.h.advance_blockhash();
    let err = execute(&mut s, invoice, 1).expect_err("replaying the same invoice");
    assert!(err.contains("AlreadyExecuted") || err.contains("custom program error"), "got {err}");
    assert_eq!(token_amount(&s.h.svm, s.recipient_token), 500 * USDC, "paid exactly once");
}

#[test]
fn per_payment_cap_refuses_an_over_limit_proposal() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [5u8; 32];
    let err = propose(&mut s, invoice, 1, 500 * USDC + 1).expect_err("over the per-payment cap");
    assert!(err.contains("OverPerPaymentLimit") || err.contains("custom program error"), "got {err}");
}

#[test]
fn daily_cap_holds_and_resets_on_a_new_utc_day() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let day_one = s.h.now();
    // Two 500 USDC payments fit exactly within the 1000 USDC daily cap.
    for (i, invoice) in [[6u8; 32], [7u8; 32]].into_iter().enumerate() {
        propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
        approve(&mut s, invoice, 1, 0).expect("approve a0");
        approve(&mut s, invoice, 1, 1).expect("approve a1");
        execute(&mut s, invoice, 1).expect("execute");
        let _ = i;
    }
    assert_eq!(token_amount(&s.h.svm, s.recipient_token), 1000 * USDC, "two payments landed");

    // A third on the same UTC day exceeds the daily cap.
    let third = [8u8; 32];
    propose(&mut s, third, 1, 500 * USDC).expect("propose third");
    approve(&mut s, third, 1, 0).expect("approve a0");
    approve(&mut s, third, 1, 1).expect("approve a1");
    s.h.advance_blockhash();
    let err = execute(&mut s, third, 1).expect_err("over the daily cap");
    assert!(err.contains("OverDailyLimit") || err.contains("custom program error"), "got {err}");

    // The next UTC day resets the counter (and the proposal is re-created fresh
    // because the original one has since expired).
    s.h.warp_clock(day_one + 86_400 + 60);
    let next_day = [9u8; 32];
    propose(&mut s, next_day, 1, 500 * USDC).expect("propose next day");
    approve(&mut s, next_day, 1, 0).expect("approve a0");
    approve(&mut s, next_day, 1, 1).expect("approve a1");
    execute(&mut s, next_day, 1).expect("execute on the new day");
    assert_eq!(token_amount(&s.h.svm, s.recipient_token), 1500 * USDC, "cap reset");
}

#[test]
fn a_stale_revision_is_refused() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [10u8; 32];
    propose(&mut s, invoice, 2, 500 * USDC).expect("propose revision 2");
    // A revision at or below the active one cannot replace it.
    s.h.advance_blockhash();
    let err = propose(&mut s, invoice, 2, 500 * USDC).expect_err("stale revision");
    assert!(err.contains("StaleRevision") || err.contains("custom program error"), "got {err}");
}

#[test]
fn pause_blocks_execution_until_governance_unpauses() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [11u8; 32];
    propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
    approve(&mut s, invoice, 1, 0).expect("approve a0");
    approve(&mut s, invoice, 1, 1).expect("approve a1");
    pause(&mut s, 0).expect("pause");
    s.h.advance_blockhash();
    let err = execute(&mut s, invoice, 1).expect_err("paused");
    assert!(err.contains("Paused") || err.contains("custom program error"), "got {err}");
}

#[test]
fn emergency_exit_sends_the_balance_to_recovery_and_closes() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    pause(&mut s, 0).expect("pause");
    let zero = || [Address::default(); 10];
    propose_governance(&mut s, 0, 2, 0, 0, zero(), 0, 0, Address::default()).expect("propose exit");
    approve_governance(&mut s, 0, 2).expect("approve a0");
    approve_governance(&mut s, 1, 2).expect("approve a1");
    execute_emergency_exit(&mut s).expect("execute exit");

    assert_eq!(token_amount(&s.h.svm, s.treasury_token), 0, "treasury drained");
    assert_eq!(token_amount(&s.h.svm, s.recovery_token), 5000 * USDC, "recovery received all");
}

#[test]
fn unpause_requires_quorum_and_restores_execution() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    pause(&mut s, 0).expect("pause");
    let zero = || [Address::default(); 10];
    propose_governance(&mut s, 0, 1, 0, 0, zero(), 0, 0, Address::default()).expect("propose unpause");

    // Below quorum the unpause cannot execute.
    approve_governance(&mut s, 0, 1).expect("approve a0");
    s.h.advance_blockhash();
    let err = execute_policy_change(&mut s, 1).expect_err("unpause below quorum");
    assert!(err.contains("NotEnoughApprovals") || err.contains("custom program error"), "got {err}");

    approve_governance(&mut s, 1, 1).expect("approve a1");
    s.h.advance_blockhash();
    execute_policy_change(&mut s, 1).expect("unpause at quorum");

    // Execution works again after the unpause.
    let invoice = [12u8; 32];
    propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
    approve(&mut s, invoice, 1, 0).expect("approve a0");
    approve(&mut s, invoice, 1, 1).expect("approve a1");
    execute(&mut s, invoice, 1).expect("execute after unpause");
}

#[test]
fn policy_change_rotates_the_signers_and_bumps_the_version() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let new_approver = Keypair::new();
    s.h.fund(new_approver.pubkey(), 100_000_000);
    let mut set = [Address::default(); 10];
    set[0] = new_approver.pubkey();
    // A 1-of-1 policy with a fresh 250 USDC per-payment cap.
    let recovery = s.h.payer_pk();
    propose_governance(&mut s, 0, 0, 1, 1, set, 250 * USDC, 1000 * USDC, recovery)
        .expect("propose policy change");
    approve_governance(&mut s, 0, 0).expect("approve a0");
    approve_governance(&mut s, 1, 0).expect("approve a1");
    execute_policy_change(&mut s, 0).expect("execute policy change");

    // The policy version incremented and the old approvers are no longer valid:
    // a former approver can no longer pause execution.
    let account = s.h.svm.get_account(&s.treasury).expect("treasury");
    assert_eq!(u64::from_le_bytes(account.data[106..114].try_into().unwrap()), 2, "policy v2");
    s.h.advance_blockhash();
    let err = pause(&mut s, 0).expect_err("old approver cannot act");
    assert!(err.contains("NotAuthorized") || err.contains("custom program error"), "got {err}");
}

#[test]
fn expired_proposal_cannot_execute() {
    let Some(h) = load() else {
        eprintln!("skip: build the program first");
        return;
    };
    let mut s = set_up(h);
    let invoice = [14u8; 32];
    propose(&mut s, invoice, 1, 500 * USDC).expect("propose");
    approve(&mut s, invoice, 1, 0).expect("approve a0");
    approve(&mut s, invoice, 1, 1).expect("approve a1");
    // The proposal lifetime is one hour in setup.
    s.h.warp_clock(s.h.now() + 3601);
    let err = execute(&mut s, invoice, 1).expect_err("expired proposal");
    assert!(err.contains("Expired") || err.contains("custom program error"), "got {err}");
}
