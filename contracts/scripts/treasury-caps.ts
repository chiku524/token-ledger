/**
 * Accounts Payable treasury: cap boundaries on devnet.
 *
 *   - a proposal above the per-payment limit is refused at propose time
 *   - two payments fill the daily cap; the third is refused (OverDailyLimit)
 *   - the daily counter resets on the next UTC day
 *
 * Uses real (test) SPL tokens on devnet. Nothing here is mainnet.
 *
 * Usage: pnpm --dir contracts/scripts caps
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
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const { AnchorProvider, Program, Wallet, BN } = anchor;
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const IDL_PATH = join(import.meta.dirname, "..", "idl", "treasury_payables.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const USDC = 1_000_000;

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

  // Approvers and the recipient only sign and receive token accounts created by
  // the payer, so they need no SOL of their own. This keeps the test cheap.
  const approvers = [Keypair.generate(), Keypair.generate()];
  const recipient = Keypair.generate();
  const entity = Keypair.generate().publicKey;

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const [treasury] = PublicKey.findProgramAddressSync([Buffer.from("treasury_config"), entity.toBuffer()], programId);
  const [treasuryAuthority] = PublicKey.findProgramAddressSync([Buffer.from("treasury_authority"), treasury.toBuffer()], programId);
  const [treasuryToken] = PublicKey.findProgramAddressSync([Buffer.from("treasury_token"), treasury.toBuffer()], programId);
  const perPayment = 300 * USDC;
  const daily = 500 * USDC;
  await program.methods
    .initializeTreasury(
      entity, mint, TOKEN_PROGRAM_ID, 2,
      approvers.map((a) => a.publicKey), [payer.publicKey],
      new BN(perPayment), new BN(daily), new BN(3600), payer.publicKey,
    )
    .accounts({ payer: payer.publicKey, entity, treasury, treasuryAuthority, treasuryToken, mint })
    .rpc();

  const funderToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  await mintTo(connection, payer, mint, funderToken.address, payer, 2000 * USDC);
  await program.methods
    .deposit(new BN(2000 * USDC))
    .accounts({ funder: payer.publicKey, treasury, funderToken: funderToken.address, treasuryToken, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  const recipientToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient.publicKey);
  const [dailySpend] = PublicKey.findProgramAddressSync([Buffer.from("daily_spend"), treasury.toBuffer()], programId);
  console.log("treasury  : 300 per-payment, 500/day, funded 2000 USDC\n");

  const payInvoice = async (seed: number, amount: number) => {
    const invoiceKey = Buffer.alloc(32, seed);
    const [proposal] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment_proposal"), treasury.toBuffer(), invoiceKey, Buffer.from([1, 0, 0, 0])],
      programId,
    );
    const [settlement] = PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), invoiceKey], programId);
    await program.methods
      .proposePayment([...invoiceKey], 1, recipient.publicKey, new BN(amount))
      .accounts({ proposer: payer.publicKey, treasury, settlement, proposal, mint })
      .rpc();
    for (const a of approvers) {
      await program.methods.approvePayment().accounts({ approver: a.publicKey, treasury, proposal }).signers([a]).rpc();
    }
    return program.methods
      .executePayment()
      .accounts({
        executor: payer.publicKey, treasury, proposal, settlement, treasuryAuthority,
        treasuryToken, recipientToken: recipientToken.address, dailySpend, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  };

  // Above per-payment: refused at propose time.
  console.log("propose 400 > 300 per-payment…");
  await expectFailure(
    "propose above per-payment limit",
    () =>
      program.methods
        .proposePayment([...Buffer.alloc(32, 1)], 1, recipient.publicKey, new BN(400 * USDC))
        .accounts({
          proposer: payer.publicKey, treasury, mint,
          settlement: PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), Buffer.alloc(32, 1)], programId)[0],
          proposal: PublicKey.findProgramAddressSync([Buffer.from("payment_proposal"), treasury.toBuffer(), Buffer.alloc(32, 1), Buffer.from([1, 0, 0, 0])], programId)[0],
        })
        .rpc(),
    "OverPerPaymentLimit",
  );

  // Two 250 payments = 500 = daily cap; both fit.
  console.log("\npaying 250 + 250 (fills 500/day)…");
  await payInvoice(2, 250 * USDC);
  await payInvoice(3, 250 * USDC);

  // A third 100 would exceed the day.
  console.log("paying a third 100 over the daily cap…");
  const invoiceKey = Buffer.alloc(32, 4);
  const [proposal] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment_proposal"), treasury.toBuffer(), invoiceKey, Buffer.from([1, 0, 0, 0])],
    programId,
  );
  const [settlement] = PublicKey.findProgramAddressSync([Buffer.from("invoice_settlement"), treasury.toBuffer(), invoiceKey], programId);
  await program.methods
    .proposePayment([...invoiceKey], 1, recipient.publicKey, new BN(100 * USDC))
    .accounts({ proposer: payer.publicKey, treasury, settlement, proposal, mint })
    .rpc();
  for (const a of approvers) {
    await program.methods.approvePayment().accounts({ approver: a.publicKey, treasury, proposal }).signers([a]).rpc();
  }
  await expectFailure(
    "third payment over the daily cap",
    () =>
      program.methods
        .executePayment()
        .accounts({
          executor: payer.publicKey, treasury, proposal, settlement, treasuryAuthority,
          treasuryToken, recipientToken: recipientToken.address, dailySpend, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    "OverDailyLimit",
  );

  const spend = await program.account.dailySpend.fetch(dailySpend);
  console.log("\ndaily     : spent", Number(spend.spent) / USDC, "of", 500, "on day", spend.day.toString());

  console.log("\nOK: per-payment and daily caps are enforced.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
