/**
 * Devnet smoke test: call `initialize_merchant` on the deployed service_balance
 * program and read the account back. Proves the committed IDL, the program ID,
 * and the on-chain program agree end to end.
 *
 * Usage: pnpm --dir contracts/scripts smoke   (or: npx tsx smoke.ts)
 *
 * Uses the local Solana CLI keypair as payer and merchant admin. Sends real
 * devnet transactions; it funds nothing and moves no tokens.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const { AnchorProvider, Program, Wallet } = anchor;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const IDL_PATH = join(import.meta.dirname, "..", "idl", "service_balance.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? join(homedir(), ".config", "solana", "id.json");

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const programId = new PublicKey(idl.metadata.address ?? idl.address);
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program(idl, provider);

  console.log("cluster   :", RPC);
  console.log("program   :", programId.toBase58());
  console.log("admin     :", payer.publicKey.toBase58());
  const balance = await connection.getBalance(payer.publicKey);
  console.log("balance   :", balance / LAMPORTS_PER_SOL, "SOL\n");

  const [merchant] = PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), payer.publicKey.toBuffer()],
    programId,
  );
  // The merchant's fixed USDC mint and destination. For the smoke test we point
  // the mint at a placeholder and the destination at the admin; the instruction
  // stores them without validating the mint account, which is fine for proving
  // the call path. Real setup passes a verified USDC mint.
  const placeholderMint = payer.publicKey;
  const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const existing = await connection.getAccountInfo(merchant);
  if (existing) {
    console.log("merchant already initialized at", merchant.toBase58());
    const account = await program.account.merchantConfig.fetch(merchant);
    console.log("admin     :", account.admin.toBase58());
    console.log("mint      :", account.mint.toBase58());
    console.log("paused    :", account.collectionPaused);
    return;
  }

  console.log("initializing merchant…");
  const sig = await program.methods
    .initializeMerchant(placeholderMint, tokenProgram, payer.publicKey)
    .accounts({ admin: payer.publicKey, collector: payer.publicKey, merchant })
    .rpc();
  console.log("signature :", sig);
  console.log("explorer  : https://explorer.solana.com/tx/" + sig + "?cluster=devnet\n");

  const account = await program.account.merchantConfig.fetch(merchant);
  console.log("read back :");
  console.log("  admin       :", account.admin.toBase58());
  console.log("  collector   :", account.collector.toBase58());
  console.log("  mint        :", account.mint.toBase58());
  console.log("  tokenProgram:", account.tokenProgram.toBase58());
  console.log("  destination :", account.destination.toBase58());
  console.log("  paused      :", account.collectionPaused);
  console.log("\nOK: the deployed program executed and the state round-tripped.");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
