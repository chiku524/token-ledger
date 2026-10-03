/**
 * Service Balance: replace a mandate in place.
 *
 * Sets up merchant/plan/vault/deposit/activate (first charge), then replaces the
 * mandate with a higher cap and later expiry. Asserts: same PDA, generation
 * incremented, paid-through preserved, cumulative debit carried over, and a
 * subsequent collect continues from the carried cycle (no double charge for
 * overlapping coverage).
 *
 * Usage: pnpm --dir contracts/scripts replace
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
const IDL_PATH = join(import.meta.dirname, "..", "idl", "service_balance.json");
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

async function main() {
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const programId = new PublicKey(idl.metadata.address ?? idl.address);
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC, "confirmed");
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" }));

  const merchantAdmin = Keypair.generate();
  const controller = payer;
  await fund(connection, payer, merchantAdmin.publicKey);

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const [merchant] = PublicKey.findProgramAddressSync([Buffer.from("merchant"), merchantAdmin.publicKey.toBuffer()], programId);
  const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, merchantAdmin.publicKey);
  await program.methods
    .initializeMerchant(mint, TOKEN_PROGRAM_ID, destination.address)
    .accounts({ admin: merchantAdmin.publicKey, collector: merchantAdmin.publicKey, merchant, mintAccount: mint })
    .signers([merchantAdmin])
    .rpc();

  const planId = Buffer.alloc(16, 11);
  const [plan] = PublicKey.findProgramAddressSync([Buffer.from("plan_version"), merchant.toBuffer(), planId, Buffer.from([1, 0])], programId);
  await program.methods
    .createPlanVersion([...planId], 1, new BN(20 * USDC), 5)
    .accounts({ admin: merchantAdmin.publicKey, merchant, plan })
    .signers([merchantAdmin])
    .rpc();

  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("billing_vault"), merchant.toBuffer(), controller.publicKey.toBuffer()], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("billing_vault"), merchant.toBuffer(), controller.publicKey.toBuffer()], programId);
  const [vaultToken] = PublicKey.findProgramAddressSync([Buffer.from("billing_vault_token"), vault.toBuffer()], programId);
  await program.methods
    .createBillingVault(controller.publicKey)
    .accounts({ controller: controller.publicKey, merchant, vault, vaultAuthority, vaultToken, mint, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();

  const controllerToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, controller.publicKey);
  await mintTo(connection, payer, mint, controllerToken.address, payer, 200 * USDC);
  await program.methods
    .deposit(new BN(200 * USDC))
    .accounts({ controller: controller.publicKey, vault, depositorToken: controllerToken.address, vaultToken, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();

  const expiry = Math.floor(Date.now() / 1000) + 200 * 24 * 60 * 60;
  const [mandate] = PublicKey.findProgramAddressSync([Buffer.from("mandate"), vault.toBuffer()], programId);
  const receiptFor = (cycle: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("charge_receipt"), mandate.toBuffer(), Buffer.from(new BN(cycle).toArray("le", 8))],
      programId,
    )[0];
  await program.methods
    .activateMandateAndCharge(new BN(100 * USDC), new BN(expiry))
    .accounts({
      controller: controller.publicKey, vault, plan, mandate, receipt: receiptFor(0), merchant, vaultAuthority, vaultToken,
      destinationToken: destination.address, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const before = await program.account.mandate.fetch(mandate);
  console.log("before    : gen", before.generation.toString(), "| debited", Number(before.totalDebited) / USDC, "| paidThrough", before.paidThrough.toString());

  // Replace in place: higher cap, same PDA.
  console.log("\nreplacing (cap 100 -> 160, generation +1)…");
  await program.methods
    .replaceMandate(new BN(160 * USDC), new BN(expiry))
    .accounts({ controller: controller.publicKey, vault, plan, mandate })
    .rpc();
  const after = await program.account.mandate.fetch(mandate);
  assert(after.generation.toString() === "1", "generation incremented to 1");
  assert(Number(after.totalDebited) === Number(before.totalDebited), "cumulative debit carried over");
  assert(Number(after.paidThrough) === Number(before.paidThrough), "paid-through preserved");
  assert(Number(after.maxTotalDebit) === 160 * USDC, "cap updated");
  console.log("after     : gen", after.generation.toString(), "| debited", Number(after.totalDebited) / USDC, "| paidThrough", after.paidThrough.toString(), "| cap", Number(after.maxTotalDebit) / USDC);

  // A collect continues from the carried cycle, debiting only the new period.
  console.log("\ncollecting after replace…");
  await program.methods
    .collectCycle(new BN(1))
    .accounts({
      collector: merchantAdmin.publicKey, merchant, vault, mandate,
      receipt: receiptFor(1), vaultAuthority,
      vaultToken, destinationToken: destination.address, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([merchantAdmin])
    .rpc();
  const collected = await program.account.mandate.fetch(mandate);
  assert(Number(collected.totalDebited) === 40 * USDC, "one more period charged, no overlap double-charge");
  console.log("debited   :", Number(collected.totalDebited) / USDC, "USDC (two periods: before + after)");

  console.log("\nOK: replace in place works; no double charge for overlapping coverage.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
