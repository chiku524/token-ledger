/**
 * Accounts Payable treasury: governance on devnet.
 *
 * Proves the control paths beyond a single payment:
 *   - an individual approver can pause execution; a paused treasury refuses a payment
 *   - unpause requires quorum and is executed via a governance proposal
 *   - a policy change (raise the per-payment cap) bumps the policy version and
 *     makes an old-version proposal non-executable (StalePolicy)
 *   - a quorum-authorized emergency exit moves the balance to the recovery
 *     wallet and closes the treasury to new payments
 *
 * Uses real (test) SPL tokens on devnet. Nothing here is mainnet.
 *
 * Usage: pnpm --dir contracts/scripts governance
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const { AnchorProvider, Program, Wallet, BN } = anchor;
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const IDL_PATH = join(import.meta.dirname, "..", "idl", "treasury_payables.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const USDC = 1_000_000;
const ZERO = new PublicKey(new Uint8Array(32));
const EMPTY_APPROVERS = Array.from({ length: 10 }, () => ZERO);

const loadKeypair = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8")) as number[]));
function assert(c: boolean, m: string) {
  if (!c) throw new Error(`assertion failed: ${m}`);
}
async function fund(connection: Connection, payer: Keypair, to: PublicKey, sol = 1) {
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })),
    [payer],
  );
}
async function expectFailure(label: string, fn: () => Promise<unknown>, includes: string) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(includes), `${label}: expected "${includes}", got "${message}"`);
    console.log(`  refused as expected: ${label}`);
    return;
  }
  throw new Error(`assertion failed: ${label} should have failed`);
}

async function main() {
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const programId = new PublicKey(idl.metadata.address ?? idl.address);
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC, "confirmed");
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" }));

  const approvers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const proposer = payer;
  const recovery = Keypair.generate();
  for (const a of approvers) await fund(connection, payer, a.publicKey, 0.5);
  await fund(connection, payer, recovery.publicKey, 0.5);
  const entity = Keypair.generate().publicKey;

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const [treasury] = PublicKey.findProgramAddressSync([Buffer.from("treasury_config"), entity.toBuffer()], programId);
  const [treasuryAuthority] = PublicKey.findProgramAddressSync([Buffer.from("treasury_authority"), treasury.toBuffer()], programId);
  const [treasuryToken] = PublicKey.findProgramAddressSync([Buffer.from("treasury_token"), treasury.toBuffer()], programId);

  await program.methods
    .initializeTreasury(
      entity, mint, TOKEN_PROGRAM_ID, 2,
      approvers.map((a) => a.publicKey), [proposer.publicKey],
      new BN(500 * USDC), new BN(1000 * USDC), new BN(3600), recovery.publicKey,
    )
    .accounts({ payer: payer.publicKey, entity, treasury, treasuryAuthority, treasuryToken, mint })
    .rpc();

  const funderToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  await mintTo(connection, payer, mint, funderToken.address, payer, 3000 * USDC);
  await program.methods
    .deposit(new BN(3000 * USDC))
    .accounts({ funder: payer.publicKey, treasury, funderToken: funderToken.address, treasuryToken, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("treasury  : 2-of-3, funded", Number((await getAccount(connection, treasuryToken)).amount) / USDC, "USDC\n");

  // ---- Pause / unpause ----------------------------------------------------
  console.log("pause     : by one approver");
  await program.methods.pauseExecution().accounts({ actor: approvers[0]!.publicKey, treasury }).signers([approvers[0]!]).rpc();
  let cfg = await program.account.treasuryConfig.fetch(treasury);
  assert(cfg.executionPaused === true, "treasury is paused");

  // A payment while paused is refused.
  const recipient = Keypair.generate();
  await fund(connection, payer, recipient.publicKey, 0.5);
  const recipientToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient.publicKey);
  const invoiceKey = Buffer.alloc(32, 21);
  const [pausedProposal] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment_proposal"), treasury.toBuffer(), invoiceKey, Buffer.from([1, 0, 0, 0])],
    programId,
  );
  const [pausedSettlement] = PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), invoiceKey], programId);
  const [dailySpend] = PublicKey.findProgramAddressSync([Buffer.from("daily_spend"), treasury.toBuffer()], programId);
  await program.methods
    .proposePayment([...invoiceKey], 1, recipient.publicKey, new BN(200 * USDC))
    .accounts({ proposer: proposer.publicKey, treasury, settlement: pausedSettlement, proposal: pausedProposal, mint })
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approvePayment().accounts({ approver: a.publicKey, treasury, proposal: pausedProposal }).signers([a]).rpc();
  }
  console.log("paused payment…");
  await expectFailure(
    "execute while paused",
    () =>
      program.methods
        .executePayment()
        .accounts({
          executor: payer.publicKey, treasury, proposal: pausedProposal, settlement: pausedSettlement,
          treasuryAuthority, treasuryToken, recipientToken: recipientToken.address, dailySpend, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    "Paused",
  );

  // Unpause via governance: propose -> approve by 2 -> execute.
  console.log("\nunpause   : governance 2-of-3");
  const [unpause] = PublicKey.findProgramAddressSync(
    [Buffer.from("governance_proposal"), treasury.toBuffer(), cfg.policyVersion.toArrayLike(Buffer, "le", 8), Buffer.from([1])],
    programId,
  );
  await program.methods
    .proposeGovernance({ unpause: {} }, 0, 0, EMPTY_APPROVERS, new BN(0), new BN(0), ZERO)
    .accounts({ actor: approvers[0]!.publicKey, treasury, governance: unpause })
    .signers([approvers[0]!])
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approveGovernance().accounts({ approver: a.publicKey, treasury, governance: unpause }).signers([a]).rpc();
  }
  await program.methods.executePolicyChange().accounts({ actor: payer.publicKey, treasury, governance: unpause }).rpc();
  cfg = await program.account.treasuryConfig.fetch(treasury);
  assert(cfg.executionPaused === false, "treasury is unpaused");

  // The payment approved before unpause still had the current policy version, so
  // it executes now that execution is not paused.
  await program.methods
    .executePayment()
    .accounts({
      executor: payer.publicKey, treasury, proposal: pausedProposal, settlement: pausedSettlement,
      treasuryAuthority, treasuryToken, recipientToken: recipientToken.address, dailySpend, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("  unpaid pause, then executed after unpause");

  // ---- Policy change: raise per-payment cap, bump the policy version ------
  console.log("\npolicy    : raise per-payment to 900, version +1");
  const versionBefore = (await program.account.treasuryConfig.fetch(treasury)).policyVersion.toNumber();
  const approverSet = [...approvers.map((a) => a.publicKey), ...Array.from({ length: 7 }, () => ZERO)];
  const [policyChange] = PublicKey.findProgramAddressSync(
    [Buffer.from("governance_proposal"), treasury.toBuffer(), Buffer.from([versionBefore, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0])],
    programId,
  );
  await program.methods
    .proposeGovernance({ policyChange: {} }, 2, 3, approverSet, new BN(900 * USDC), new BN(2000 * USDC), recovery.publicKey)
    .accounts({ actor: approvers[0]!.publicKey, treasury, governance: policyChange })
    .signers([approvers[0]!])
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approveGovernance().accounts({ approver: a.publicKey, treasury, governance: policyChange }).signers([a]).rpc();
  }
  await program.methods.executePolicyChange().accounts({ actor: payer.publicKey, treasury, governance: policyChange }).rpc();
  const versionAfter = (await program.account.treasuryConfig.fetch(treasury)).policyVersion.toNumber();
  assert(versionAfter === versionBefore + 1, "policy version incremented");
  const raised = await program.account.treasuryConfig.fetch(treasury);
  assert(Number(raised.perPaymentLimit) === 900 * USDC, "per-payment cap raised");
  console.log("  version", versionBefore, "->", versionAfter, "| per-payment", Number(raised.perPaymentLimit) / USDC);

  // A proposal using the old policy version is now non-executable.
  console.log("\nstale proposal (old policy version)…");
  const staleKey = Buffer.alloc(32, 22);
  const [staleProposal] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment_proposal"), treasury.toBuffer(), staleKey, Buffer.from([1, 0, 0, 0])],
    programId,
  );
  const [staleSettlement] = PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), staleKey], programId);
  // Proposing now records the *new* policy version, so to test staleness we
  // approve then bump the version again via a second policy change.
  await program.methods
    .proposePayment([...staleKey], 1, recipient.publicKey, new BN(200 * USDC))
    .accounts({ proposer: proposer.publicKey, treasury, settlement: staleSettlement, proposal: staleProposal, mint })
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approvePayment().accounts({ approver: a.publicKey, treasury, proposal: staleProposal }).signers([a]).rpc();
  }
  const [policyChange2] = PublicKey.findProgramAddressSync(
    [Buffer.from("governance_proposal"), treasury.toBuffer(), Buffer.from([versionAfter, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0])],
    programId,
  );
  await program.methods
    .proposeGovernance({ policyChange: {} }, 2, 3, approverSet, new BN(900 * USDC), new BN(2000 * USDC), recovery.publicKey)
    .accounts({ actor: approvers[0]!.publicKey, treasury, governance: policyChange2 })
    .signers([approvers[0]!])
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approveGovernance().accounts({ approver: a.publicKey, treasury, governance: policyChange2 }).signers([a]).rpc();
  }
  await program.methods.executePolicyChange().accounts({ actor: payer.publicKey, treasury, governance: policyChange2 }).rpc();
  await expectFailure(
    "execute a proposal approved under an old policy version",
    () =>
      program.methods
        .executePayment()
        .accounts({
          executor: payer.publicKey, treasury, proposal: staleProposal, settlement: staleSettlement,
          treasuryAuthority, treasuryToken, recipientToken: recipientToken.address, dailySpend, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    "StalePolicy",
  );

  // ---- Emergency exit -----------------------------------------------------
  console.log("\nemergency exit: pause, propose, 2-of-3, execute");
  await program.methods.pauseExecution().accounts({ actor: approvers[0]!.publicKey, treasury }).signers([approvers[0]!]).rpc();
  const versionNow = (await program.account.treasuryConfig.fetch(treasury)).policyVersion.toNumber();
  const [exit] = PublicKey.findProgramAddressSync(
    [Buffer.from("governance_proposal"), treasury.toBuffer(), Buffer.from([versionNow, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([2])],
    programId,
  );
  await program.methods
    .proposeGovernance({ emergencyExit: {} }, 0, 0, EMPTY_APPROVERS, new BN(0), new BN(0), ZERO)
    .accounts({ actor: approvers[0]!.publicKey, treasury, governance: exit })
    .signers([approvers[0]!])
    .rpc();
  for (const a of approvers.slice(0, 2)) {
    await program.methods.approveGovernance().accounts({ approver: a.publicKey, treasury, governance: exit }).signers([a]).rpc();
  }
  const recoveryToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recovery.publicKey);
  await program.methods
    .executeEmergencyExit()
    .accounts({ actor: payer.publicKey, treasury, governance: exit, treasuryAuthority, treasuryToken, recoveryToken: recoveryToken.address, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  const recoveryBal = (await getAccount(connection, recoveryToken.address)).amount;
  const treasuryBal = (await getAccount(connection, treasuryToken)).amount;
  console.log("  recovery  :", Number(recoveryBal) / USDC, "USDC | treasury:", Number(treasuryBal) / USDC, "USDC");
  assert(Number(recoveryBal) > 0, "recovery wallet received the balance");
  assert(Number(treasuryBal) === 0, "treasury emptied");
  cfg = await program.account.treasuryConfig.fetch(treasury);
  assert(cfg.closed === true, "treasury is closed after exit");

  // No further payments after exit.
  console.log("post-exit payment…");
  await expectFailure(
    "propose after emergency exit",
    () =>
      program.methods
        .proposePayment([...Buffer.alloc(32, 23)], 1, recipient.publicKey, new BN(100 * USDC))
        .accounts({ proposer: proposer.publicKey, treasury, settlement: PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), Buffer.alloc(32, 23)], programId)[0], proposal: PublicKey.findProgramAddressSync([Buffer.from("payment_proposal"), treasury.toBuffer(), Buffer.alloc(32, 23), Buffer.from([1, 0, 0, 0])], programId)[0], mint })
        .rpc(),
    "TreasuryClosed",
  );

  console.log("\nOK: pause/unpause, policy change with stale-invalidation, and emergency exit all work.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
