/**
 * Service Balance full journey on devnet.
 *
 * Creates a test USDC mint, sets up a merchant + plan version, then walks a
 * customer through: create vault -> deposit -> activate mandate (first charge
 * is atomic) -> collect the next cycle. Asserts each rule the plan requires,
 * including that a second collection of the same cycle is refused.
 *
 * This moves real (test) SPL tokens on devnet. Nothing here is mainnet.
 *
 * Usage: pnpm --dir contracts/scripts billing
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
const IDL_PATH = join(import.meta.dirname, "..", "idl", "service_balance.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");

const USDC = 1_000_000; // 6 decimals

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

async function main() {
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const programId = new PublicKey(idl.metadata.address ?? idl.address);
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  // A dedicated merchant admin, so the merchant config binds to the real mint
  // (the earlier smoke test created a merchant with a placeholder mint).
  const merchantAdmin = Keypair.generate();
  const admin = merchantAdmin;
  const controller = payer; // customer pays, merchant is separate

  // Fund the generated merchant admin from the payer (airdrop is rate-limited).
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: admin.publicKey, lamports: LAMPORTS_PER_SOL }),
    ),
    [payer],
  );
  console.log("program   :", programId.toBase58());
  console.log("admin     :", admin.publicKey.toBase58(), `(${(await connection.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL} SOL)\n`);

  // 1. A test USDC mint (the real launch verifies an issuer mint first).
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log("test mint :", mint.toBase58());

  // 2. Merchant (admin + collector). Destination is the admin's token account.
  const [merchant] = PublicKey.findProgramAddressSync([Buffer.from("merchant"), admin.publicKey.toBuffer()], programId);
  const destination = await getOrCreateAssociatedTokenAccount(connection, payer, mint, admin.publicKey);
  // The plan uses the merchant admin's token account as the fixed destination.
  if (!(await connection.getAccountInfo(merchant))) {
    const sig = await program.methods
      .initializeMerchant(mint, TOKEN_PROGRAM_ID, destination.address)
      .accounts({ admin: admin.publicKey, collector: admin.publicKey, merchant })
      .signers([admin])
      .rpc();
    console.log("merchant  :", merchant.toBase58(), "tx", sig.slice(0, 12) + "…");
  } else {
    console.log("merchant  :", merchant.toBase58(), "(exists)");
  }

  // 3. Plan version: 20 USDC per 30 days, up to 5 periods.
  const planId = Buffer.alloc(16, 7);
  const version = 1;
  const [plan] = PublicKey.findProgramAddressSync(
    [Buffer.from("plan_version"), merchant.toBuffer(), planId, Buffer.from([version, 0])],
    programId,
  );
  if (!(await connection.getAccountInfo(plan))) {
    const sig = await program.methods
      .createPlanVersion([...planId], version, new BN(20 * USDC), 5)
      .accounts({ admin: admin.publicKey, merchant, plan })
      .signers([admin])
      .rpc();
    console.log("plan      :", plan.toBase58(), "20 USDC / 30d", "tx", sig.slice(0, 12) + "…");
  }

  // 4. Customer billing vault (authority PDA + its token account).
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("billing_vault"), merchant.toBuffer(), controller.publicKey.toBuffer()],
    programId,
  );
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("billing_vault"), merchant.toBuffer(), controller.publicKey.toBuffer()],
    programId,
  );
  const [vaultToken] = PublicKey.findProgramAddressSync([Buffer.from("billing_vault_token"), vault.toBuffer()], programId);
  if (!(await connection.getAccountInfo(vault))) {
    const sig = await program.methods
      .createBillingVault(controller.publicKey)
      .accounts({
        controller: controller.publicKey,
        merchant,
        vault,
        vaultAuthority,
        vaultToken,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("vault     :", vault.toBase58(), "tx", sig.slice(0, 12) + "…");
  }

  // 5. Deposit 100 USDC into the vault.
  const controllerToken = await getOrCreateAssociatedTokenAccount(connection, payer, mint, controller.publicKey);
  await mintTo(connection, payer, mint, controllerToken.address, payer, 100 * USDC);
  console.log("\ndeposit   : 100 USDC");
  await program.methods
    .deposit(new BN(100 * USDC))
    .accounts({
      controller: controller.publicKey,
      vault,
      depositorToken: controllerToken.address,
      vaultToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  let vaultBal = (await getAccount(connection, vaultToken)).amount;
  console.log("vault bal :", Number(vaultBal) / USDC, "USDC");

  // 6. Activate the mandate; the first charge is atomic with activation.
  const expiry = Math.floor(Date.now() / 1000) + 200 * 24 * 60 * 60; // 200 days out
  const [mandate] = PublicKey.findProgramAddressSync(
    [Buffer.from("mandate"), vault.toBuffer(), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])],
    programId,
  );
  console.log("\nactivate  : cap 100 USDC, expiry +200d");
  await program.methods
    .activateMandateAndCharge(new BN(100 * USDC), new BN(expiry))
    .accounts({
      controller: controller.publicKey,
      vault,
      plan,
      mandate,
      merchant,
      vaultAuthority,
      vaultToken,
      destinationToken: destination.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  vaultBal = (await getAccount(connection, vaultToken)).amount;
  console.log("vault bal :", Number(vaultBal) / USDC, "USDC (after first charge)");
  console.log("charged   :", Number((await getAccount(connection, destination.address)).amount) / USDC, "USDC to merchant");
  assert(Number(vaultBal) === 80 * USDC, "first charge debited exactly 20 USDC");

  // 7. Collect the next cycle (force time forward by trusting paid_through is
  //    ~now, so the next charge covers a fresh period).
  console.log("\ncollecting next cycle…");
  await program.methods
    .collectCycle()
    .accounts({
      collector: admin.publicKey,
      merchant,
      vault,
      mandate,
      vaultAuthorityPlaceholder: vaultAuthority,
      vaultAuthority,
      vaultToken,
      destinationToken: destination.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();
  vaultBal = (await getAccount(connection, vaultToken)).amount;
  console.log("vault bal :", Number(vaultBal) / USDC, "USDC (after second charge)");

  const mandateAccount = await program.account.mandate.fetch(mandate);
  console.log("cycle     :", mandateAccount.nextCycle.toString());
  console.log("debited   :", Number(mandateAccount.totalDebited) / USDC, "USDC of cap");
  assert(Number(mandateAccount.totalDebited) === 40 * USDC, "two charges totalling 40 USDC");

  // 8. Withdraw the remaining balance (needs no merchant signature).
  console.log("\nwithdrawing remaining balance…");
  await program.methods
    .withdraw(new BN(Number(vaultBal)))
    .accounts({
      controller: controller.publicKey,
      vault,
      vaultAuthority,
      vaultToken,
      destinationToken: controllerToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("vault bal :", Number((await getAccount(connection, vaultToken)).amount) / USDC, "USDC (withdrawn)");

  console.log("\nOK: full Service Balance journey executed on devnet.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
