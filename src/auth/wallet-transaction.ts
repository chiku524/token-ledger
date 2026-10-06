/**
 * Browser transaction signing for the contracts. Separate from `wallet-signer`
 * (which only signs messages) because this pulls `@solana/web3.js` for the
 * `VersionedTransaction` type, and it is imported only from client components.
 *
 * It never handles a key: the wallet signs the assembled transaction and returns
 * the signed one. Two wallet shapes are supported — an injected wallet that takes
 * a `VersionedTransaction`, and a wallet-standard provider that signs serialized
 * bytes.
 */
import { VersionedTransaction } from "@solana/web3.js";

/** An injected wallet (Phantom, Solflare, Backpack), which signs a transaction object. */
export interface InjectedTransactionProvider {
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

interface WalletStandardSignFeature {
  signTransaction(input: {
    transaction: Uint8Array;
    account: { address: string };
    chain: string;
  }): Promise<Array<{ signedTransaction: Uint8Array }>>;
}

/** A wallet-standard provider (as Reown's Solana adapter exposes), which signs bytes. */
export interface WalletStandardProvider {
  features: Record<string, unknown>;
  publicKey?: { toString(): string } | null;
}

export type SolanaTransactionProvider = InjectedTransactionProvider | WalletStandardProvider;

function hasInjectedSigner(provider: SolanaTransactionProvider): provider is InjectedTransactionProvider {
  return typeof (provider as InjectedTransactionProvider).signTransaction === "function";
}

function standardFeature(provider: SolanaTransactionProvider): WalletStandardSignFeature | null {
  const feature = (provider as WalletStandardProvider).features?.["solana:signTransaction"];
  if (feature && typeof (feature as WalletStandardSignFeature).signTransaction === "function") {
    return feature as WalletStandardSignFeature;
  }
  return null;
}

/**
 * Ask the wallet to sign an assembled transaction. `cluster` names the wallet's
 * network, e.g. "devnet", and is only passed to a wallet-standard provider.
 */
export async function signSolanaTransaction(
  provider: SolanaTransactionProvider,
  transaction: VersionedTransaction,
  cluster = "devnet",
): Promise<VersionedTransaction> {
  if (hasInjectedSigner(provider)) {
    return provider.signTransaction(transaction);
  }
  const feature = standardFeature(provider);
  if (feature) {
    const current = await transaction;
    const address = (provider as WalletStandardProvider).publicKey?.toString();
    if (!address) throw new Error("Connect the wallet before signing.");
    const [result] = await feature.signTransaction({
      transaction: current.serialize(),
      account: { address },
      chain: `solana:${cluster}`,
    });
    if (!result?.signedTransaction) throw new Error("The wallet did not sign the transaction.");
    return VersionedTransaction.deserialize(result.signedTransaction);
  }
  throw new Error("This wallet cannot sign a transaction. Use an installed wallet or WalletConnect.");
}
