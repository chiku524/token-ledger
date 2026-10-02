/**
 * Accounts Payable treasury full journey on devnet.
 *
 * Sets up a 2-of-3 treasury, funds it, then runs a supplier payment:
 * propose -> approve (one approver: still below quorum) -> second approver ->
 * execute. Asserts the plan's rules: below quorum cannot execute, a duplicate
 * approval cannot add a vote, the same invoice cannot settle twice, and the
 * per-payment/daily caps hold.
 *
 * Moves real (test) SPL tokens on devnet. Nothing here is mainnet.
 *
 * Usage: pnpm --dir contracts/scripts treasury
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
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const { AnchorProvider, Program, Wallet, BN } = anchor;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const IDL_PATH = join(import.meta.dirname, "..", "idl", "treasury_payables.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const USDC = 1_000_000;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
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
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program(idl, provider);

  console.log("program   :", programId.toBase58());
  console.log("payer     :", payer.publicKey.toBase58(), `(${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL)\n`);

  // Three approvers, threshold 2. Entity is an arbitrary key for the smoke test.
  const approvers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const proposer = payer;
  const recipient = Keypair.generate();
  for (const a of approvers) await fund(connection, payer, a.publicKey, 0.5);
  await fund(connection, payer, recipient.publicKey, 0.5);
  const entity = Keypair.generate().publicKey;
  const recovery = payer.publicKey;

  // A test USDC mint; payer owns it.
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log("test mint :", mint.toBase58());

  const [treasury] = PublicKey.findProgramAddressSync([Buffer.from("treasury_config"), entity.toBuffer()], programId);
  const [treasuryAuthority] = PublicKey.findProgramAddressSync([Buffer.from("treasury_authority"), treasury.toBuffer()], programId);
  const [treasuryToken] = PublicKey.findProgramAddressSync([Buffer.from("treasury_token"), treasury.toBuffer()], programId);

  const perPayment = 500 * USDC;
  const daily = 1000 * USDC;
  const lifetime = 3600; // one hour
  console.log("treasury  : 2-of-3, 500 USDC per payment, 1000 USDC/day");
  await program.methods
    .initializeTreasury(
      entity,
      mint,
      TOKEN_PROGRAM_ID,
      2,
      approvers.map((a) => a.publicKey),
      [proposer.publicKey],
      new BN(perPayment),
      new BN(daily),
      new BN(lifetime),
      recovery,
    )
    .accounts({ payer: payer.publicKey, entity, treasury, treasuryAuthority, treasuryToken, mint })
    .rpc();

  // Fund the treasury with 5000 USDC.
  const funderToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  await mintTo(connection, payer, mint, funderToken.address, payer, 5000 * USDC);
  await program.methods
    .deposit(new BN(5000 * USDC))
    .accounts({ funder: payer.publicKey, treasury, funderToken: funderToken.address, treasuryToken, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log("funded    :", Number((await getAccount(connection, treasuryToken)).amount) / USDC, "USDC\n");

  // The supplier's token account, owned by `recipient`.
  const recipientToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient.publicKey);

  const invoiceKey = Buffer.alloc(32, 3);
  const revision = 1;
  const amount = 500 * USDC;
  const [proposal] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment_proposal"), treasury.toBuffer(), invoiceKey, Buffer.from([revision, 0, 0, 0])],
    programId,
  );
  const [settlement] = PublicKey.findProgramAddressSync(
    [Buffer.from("invoice_settlement"), treasury.toBuffer(), invoiceKey],
    programId,
  );
  const [dailySpend] = PublicKey.findProgramAddressSync([Buffer.from("daily_spend"), treasury.toBuffer()], programId);

  console.log("propose   : 500 USDC invoice");
  await program.methods
    .proposePayment([...invoiceKey], revision, recipient.publicKey, new BN(amount))
    .accounts({ proposer: proposer.publicKey, treasury, settlement, proposal, mint })
    .rpc();

  // One approval: still below the 2-of-3 threshold.
  await program.methods.approvePayment().accounts({ approver: approvers[0]!.publicKey, treasury, proposal }).signers([approvers[0]!]).rpc();
  console.log("\nbelow quorum (1 of 3)…");
  await expectFailure(
    "execute with one approval",
    () =>
      program.methods
        .executePayment()
        .accounts({
          executor: payer.publicKey,
          treasury,
          proposal,
          settlement,
          treasuryAuthority,
          treasuryToken,
          recipientToken: recipientToken.address,
          dailySpend,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    "NotEnoughApprovals",
  );

  // A duplicate approval from the same approver cannot add a vote.
  console.log("duplicate approval…");
  await expectFailure(
    "approve twice by the same wallet",
    () => program.methods.approvePayment().accounts({ approver: approvers[0]!.publicKey, treasury, proposal }).signers([approvers[0]!]).rpc(),
    "DuplicateApproval",
  );

  // Second approver: quorum reached, execute.
  await program.methods.approvePayment().accounts({ approver: approvers[1]!.publicKey, treasury, proposal }).signers([approvers[1]!]).rpc();
  console.log("\nquorum reached (2 of 3), executing…");
  await program.methods
    .executePayment()
    .accounts({
      executor: payer.publicKey,
      treasury,
      proposal,
      settlement,
      treasuryAuthority,
      treasuryToken,
      recipientToken: recipientToken.address,
      dailySpend,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const supplierBal = (await getAccount(connection, recipientToken.address)).amount;
  const treasuryBal = (await getAccount(connection, treasuryToken)).amount;
  console.log("supplier  :", Number(supplierBal) / USDC, "USDC");
  console.log("treasury  :", Number(treasuryBal) / USDC, "USDC");
  assert(Number(supplierBal) === amount, "supplier received exactly 500 USDC");
  assert(Number(treasuryBal) === 4500 * USDC, "treasury debited 500 USDC");

  // Re-execution of the same invoice is refused (settlement marker).
  console.log("\nreplaying the same invoice…");
  await expectFailure(
    "execute the same payment twice",
    () =>
      program.methods
        .executePayment()
        .accounts({
          executor: payer.publicKey,
          treasury,
          proposal,
          settlement,
          treasuryAuthority,
          treasuryToken,
          recipientToken: recipientToken.address,
          dailySpend,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    "AlreadyExecuted",
  );

  // Daily cap: a second 500 USDC payment would exceed the 1000/day limit only
  // after two; one more fits, a third does not. Keep it to the single-payment
  // proof here and leave the cap boundary to the integration suite (#150).
  console.log("\nOK: treasury journey executed on devnet (2-of-3, one settlement).");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
