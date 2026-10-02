//! Prove the litesvm harness: load the built service_balance program into the
//! in-process VM and confirm it is present. Real instruction tests build on this.
use litesvm::LiteSVM;
use solana_address::Address;

const SERVICE_BALANCE: &str = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";

#[test]
fn service_balance_program_loads() {
    let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/service_balance.so");
    if !std::path::Path::new(so).exists() {
        eprintln!("skip: build the program first (cargo-build-sbf)");
        return;
    }
    let mut svm = LiteSVM::new().with_sysvars().with_builtins();
    let program_id = Address::from_str_const(SERVICE_BALANCE);
    svm.add_program_from_file(program_id, so).expect("load service_balance");
    let account = svm.get_account(&program_id).expect("program account present");
    assert!(!account.data.is_empty(), "program has bytecode");
}
