//! Shared helpers for the litesvm integration tests: instruction building on
//! top of the raw program, and small account fixtures.

use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::Transaction;
use spl_token_interface::state::Account as TokenAccount;

/// Anchor's 8-byte instruction discriminator: sha256("global:<name>")[..8].
pub fn discriminator(name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("global:{name}").as_bytes());
    let mut out = [0u8; 8];
    out.copy_from_slice(&hash[..8]);
    out
}

pub const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";
pub const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

pub fn token_program() -> Address {
    Address::from_str_const(TOKEN_PROGRAM)
}

pub fn system_program() -> Address {
    Address::from_str_const(SYSTEM_PROGRAM)
}

/// A funded payer in a fresh VM loaded with a program's bytecode.
pub struct Harness {
    pub svm: LiteSVM,
    pub program_id: Address,
    pub payer: Keypair,
}

impl Harness {
    /// Load a program from `target/deploy/<name>.so`, or `None` when it has not
    /// been built (the artifact is not committed).
    pub fn load(program_id: &str, program_name: &str) -> Option<Harness> {
        let path = format!("{}/../target/deploy/{program_name}.so", env!("CARGO_MANIFEST_DIR"));
        let bytes = std::fs::read(path).ok()?;
        let mut svm = LiteSVM::new().with_sysvars().with_builtins().with_default_programs();
        let program_id = Address::from_str_const(program_id);
        svm.add_program(program_id, &bytes).expect("load program");
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 100_000_000_000).expect("airdrop");
        Some(Harness { svm, program_id, payer })
    }

    pub fn payer_pk(&self) -> Address {
        self.payer.pubkey()
    }

    /// Send one instruction, signed by the payer.
    pub fn send(&mut self, ix: Instruction) -> Result<(), String> {
        self.send_signed(ix, &[])
    }

    /// Send one instruction, signed by the payer and additional keypairs.
    pub fn send_signed(&mut self, ix: Instruction, extra: &[&Keypair]) -> Result<(), String> {
        let blockhash = self.svm.latest_blockhash();
        let mut signers: Vec<&Keypair> = vec![&self.payer];
        signers.extend_from_slice(extra);
        let msg = Message::new_with_blockhash(&[ix], Some(&self.payer.pubkey()), &blockhash);
        let tx = Transaction::new(&signers, msg, blockhash);
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{e:?}"))
    }

    /// Fund an address with lamports from the airdrop account.
    pub fn fund(&mut self, address: Address, lamports: u64) {
        self.svm.airdrop(&address, lamports).expect("airdrop");
    }

    /// Move the clock to a unix timestamp while keeping the current slot. Used by
    /// time-based cases (mandate expiry, daily-cap reset) devnet cannot test.
    pub fn warp_clock(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    /// The current unix timestamp of the VM clock.
    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<solana_clock::Clock>().unix_timestamp
    }

    /// Expire the current blockhash so an otherwise byte-identical resend is not
    /// deduplicated (litesvm rejects a repeat of the exact same transaction).
    pub fn advance_blockhash(&mut self) {
        self.svm.expire_blockhash();
    }

    /// Create an initialized SPL mint, owned by the token program.
    pub fn set_mint(&mut self, address: Address, authority: Address, decimals: u8) {
        let mint = spl_token_interface::state::Mint {
            mint_authority: solana_program_option::COption::Some(authority.to_bytes().into()),
            supply: 0,
            decimals,
            is_initialized: true,
            freeze_authority: solana_program_option::COption::None,
        };
        let mut data = [0u8; spl_token_interface::state::Mint::LEN];
        Pack::pack(mint, &mut data).unwrap();
        self.svm
            .set_account(
                address,
                Account {
                    lamports: 10_000_000,
                    data: data.to_vec(),
                    owner: token_program(),
                    ..Default::default()
                },
            )
            .expect("set mint");
    }

    /// Create an SPL token account holding `amount`, owned by `owner`, for a mint.
    /// Written directly (litesvm's own pattern) rather than via an instruction.
    pub fn set_token_account(&mut self, address: Address, mint: Address, owner: Address, amount: u64) {
        let account = TokenAccount {
            mint: mint.to_bytes().into(),
            owner: owner.to_bytes().into(),
            amount,
            delegate: solana_program_option::COption::None,
            state: spl_token_interface::state::AccountState::Initialized,
            is_native: solana_program_option::COption::None,
            delegated_amount: 0,
            close_authority: solana_program_option::COption::None,
        };
        let mut data = [0u8; TokenAccount::LEN];
        Pack::pack(account, &mut data).unwrap();
        self.svm
            .set_account(
                address,
                Account {
                    lamports: 10_000_000,
                    data: data.to_vec(),
                    owner: token_program(),
                    ..Default::default()
                },
            )
            .expect("set token account");
    }
}

/// A minimal initialize_merchant instruction for the service_balance program.
pub fn initialize_merchant_ix(
    program_id: Address,
    admin: Address,
    merchant: Address,
    collector: Address,
    mint: Address,
    destination: Address,
) -> Instruction {
    let mut data = discriminator("initialize_merchant").to_vec();
    data.extend_from_slice(mint.as_ref());
    data.extend_from_slice(&token_program().to_bytes());
    data.extend_from_slice(destination.as_ref());
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(admin, true),
            AccountMeta::new_readonly(collector, false),
            AccountMeta::new(merchant, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(system_program(), false),
        ],
        data,
    }
}
