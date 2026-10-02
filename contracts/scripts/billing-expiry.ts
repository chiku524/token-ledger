/**
 * Service Balance: authorization-expiry boundaries on devnet.
 *
 * The devnet clock cannot be fast-forwarded, so a mandate that *becomes* expired
 * over time is not testable here (that needs the warpable local suite, #150).
 * What this proves is the boundary the code checks at signing and replacement:
 * new coverage must end on or before the authorization expiry, so a mandate can
 * never be signed or replaced whose coverage would run past its expiry.
 *
 *   - activate with an expiry under one 30-day period -> CoveragePastExpiry
 *   - activate with a valid expiry -> ok
 *   - replace with an expiry that leaves less than a period of coverage -> CoveragePastExpiry
 *
 * Usage: pnpm --dir contracts/scripts expiry
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
const IDL_PATH = join(import.meta.dirname, "..", "idl", "service_balance.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");
const USDC = 1_000_000;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

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
  const controller = payer;
  await fund(connection, payer, merchantAdmin.publicKey, 0.05);

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const [merchant] = PublicKey.findProgramAddressSync([Buffer.from("merchant"), merchantAdmin.publicKey.toBuffer()], programId);
  const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, merchantAdmin.publicKey);
  await program.methods
    .initializeMerchant(mint, TOKEN_PROGRAM_ID, destination.address)
    .accounts({ admin: merchantAdmin.publicKey, collector: merchantAdmin.publicKey, merchant })
    .signers([merchantAdmin])
    .rpc();

  const planId = Buffer.alloc(16, 31);
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

  const [mandate] = PublicKey.findProgramAddressSync([Buffer.from("mandate"), vault.toBuffer()], programId);
  const accounts = {
    controller: controller.publicKey, vault, plan, mandate, merchant, vaultAuthority, vaultToken,
    destinationToken: destination.address, tokenProgram: TOKEN_PROGRAM_ID,
  };

  const now = Math.floor(Date.now() / 1000);

  // Expiry under one period: activation coverage would run past it.
  console.log("activate with expiry < one period…");
  await expectFailure(
    "activate when coverage would run past expiry",
    () => program.methods.activateMandateAndCharge(new BN(100 * USDC), new BN(now + THIRTY_DAYS - 60)).accounts(accounts).rpc(),
    "CoveragePastExpiry",
  );

  // Valid expiry: activation succeeds.
  console.log("\nactivate with a valid expiry…");
  const goodExpiry = now + 200 * 24 * 60 * 60;
  await program.methods.activateMandateAndCharge(new BN(100 * USDC), new BN(goodExpiry)).accounts(accounts).rpc();
  const activated = await program.account.mandate.fetch(mandate);
  assert(activated.paidThrough.toNumber() > now, "coverage is in the future");
  console.log("  activated; paidThrough", activated.paidThrough.toString(), "expiry", goodExpiry);

  // Replace with an expiry that leaves under a period from paid-through.
  console.log("\nreplace with too-short expiry…");
  await expectFailure(
    "replace when the new coverage would run past expiry",
    () => program.methods.replaceMandate(new BN(160 * USDC), new BN(activated.paidThrough.toNumber() + 60)).accounts({ controller: controller.publicKey, vault, plan, mandate }).rpc(),
    "CoveragePastExpiry",
  );

  // Replace with a valid expiry succeeds.
  console.log("\nreplace with a valid expiry…");
  await program.methods.replaceMandate(new BN(160 * USDC), new BN(now + 300 * 24 * 60 * 60)).accounts({ controller: controller.publicKey, vault, plan, mandate }).rpc();
  const replaced = await program.account.mandate.fetch(mandate);
  assert(replaced.generation.toNumber() === 1, "generation advanced");
  console.log("  replaced; generation", replaced.generation.toString());

  console.log("\nOK: coverage-past-expiry is refused at activation and replacement.");
  console.log("Note: a mandate that becomes expired over time is covered by the");
  console.log("warpable local suite (#150); devnet cannot advance the clock.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
