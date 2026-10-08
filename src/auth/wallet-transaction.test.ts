import { describe, expect, it } from "vitest";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { signSolanaTransaction, type InjectedTransactionProvider, type WalletStandardProvider } from "./wallet-transaction";

const BLOCKHASH = "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM";

function unsignedTransaction(payer: Keypair): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe("signSolanaTransaction", () => {
  it("asks an injected wallet to sign the transaction object", async () => {
    const payer = Keypair.generate();
    const transaction = unsignedTransaction(payer);
    const provider: InjectedTransactionProvider = {
      async signTransaction(tx) {
        tx.sign([payer]);
        return tx;
      },
    };
    const signed = await signSolanaTransaction(provider, transaction);
    expect(signed.signatures[0]!.some((byte) => byte !== 0)).toBe(true);
  });

  it("asks a wallet-standard provider to sign serialized bytes", async () => {
    const payer = Keypair.generate();
    const transaction = unsignedTransaction(payer);
    const provider: WalletStandardProvider = {
      publicKey: { toString: () => payer.publicKey.toBase58() },
      features: {
        "solana:signTransaction": {
          async signTransaction(input: { transaction: Uint8Array; account: { address: string }; chain: string }) {
            expect(input.chain).toBe("solana:devnet");
            const decoded = VersionedTransaction.deserialize(input.transaction);
            decoded.sign([payer]);
            return [{ signedTransaction: decoded.serialize() }];
          },
        },
      },
    };
    const signed = await signSolanaTransaction(provider, transaction, "devnet");
    expect(signed.signatures[0]!.some((byte) => byte !== 0)).toBe(true);
  });

  it("refuses a provider that cannot sign", async () => {
    const payer = Keypair.generate();
    await expect(signSolanaTransaction({ features: {} }, unsignedTransaction(payer))).rejects.toThrow(/cannot sign/);
  });
});
