/**
 * Service Balance: revoke a mandate and prove collection is then refused.
 *
 * Sets up merchant/plan/vault/deposit/activate, revokes the mandate from the
 * controller, and asserts a subsequent collect is refused. The signed cap,
 * cycle state, and paid-through are unchanged by revocation; paid access runs to
 * its recorded end.
 *
 * Usage: pnpm --dir contracts/scripts revoke
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

  const merchantAdmin = Keypair.generate();
  const collector = merchantAdmin;
  const controller = payer;
  await fund(connection, payer, merchantAdmin.publicKey);

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const [merchant] = PublicKey.findProgramAddressSync([Buffer.from("merchant"), merchantAdmin.publicKey.toBuffer()], programId);
  const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, merchantAdmin.publicKey);
  await program.methods
    .initializeMerchant(mint, TOKEN_PROGRAM_ID, destination.address)
    .accounts({ admin: merchantAdmin.publicKey, collector: collector.publicKey, merchant })
    .signers([merchantAdmin])
    .rpc();

  const planId = Buffer.alloc(16, 9);
  const [plan] = PublicKey.findProgramAddressSync(
    [Buffer.from("plan_version"), merchant.toBuffer(), planId, Buffer.from([1, 0])],
    programId,
  );
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
  await mintTo(connection, payer, mint, controllerToken.address, payer, 100 * USDC);
  await program.methods
    .deposit(new BN(100 * USDC))
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
  console.log("activated : vault", Number((await getAccount(connection, vaultToken)).amount) / USDC, "USDC\n");

  // Revoke from the controller: no merchant signature needed.
  console.log("revoking mandate…");
  await program.methods.revokeMandate().accounts({ controller: controller.publicKey, vault, mandate }).rpc();
  const after = await program.account.mandate.fetch(mandate);
  assert(after.revoked === true, "mandate is marked revoked");
  assert(Number(after.totalDebited) === 20 * USDC, "revocation did not change the debited total");
  console.log("  revoked   :", after.revoked, "| debited unchanged:", Number(after.totalDebited) / USDC, "USDC");

  // A revoked mandate refuses collection.
  console.log("\ncollecting after revoke…");
  const [vaultAuthorityCheck] = PublicKey.findProgramAddressSync([Buffer.from("billing_vault"), merchant.toBuffer(), controller.publicKey.toBuffer()], programId);
  await expectFailure(
    "collect a revoked mandate",
    () =>
      program.methods
        .collectCycle(new BN(1))
        .accounts({
          collector: collector.publicKey, merchant, vault, mandate,
          receipt: receiptFor(1), vaultAuthority: vaultAuthorityCheck,
          vaultToken, destinationToken: destination.address, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([merchantAdmin])
        .rpc(),
    "MandateRevoked",
  );

  console.log("\nOK: revoke works and a revoked mandate cannot be charged.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
