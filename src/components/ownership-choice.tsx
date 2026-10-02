export function OwnershipChoice({ walletConnectReady }: { walletConnectReady: boolean }) {
  return (
    <section aria-labelledby="ownership-heading" className="panel p-4">
      <h2 id="ownership-heading" className="text-lg font-semibold tracking-tight">
        Prove control, or watch an address
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium">Connect and sign</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Connect an Ethereum, Polygon, or Solana wallet and sign a one-time message. The signature shows this
            sign-in controls the address. It does not allow a transfer, and no key is stored.
          </p>
        </div>
        <div>
          <h3 className="font-medium">Watch an address</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Paste a public address. No signature is required. Use this for an auditor, a cold address, or any wallet
            you cannot sign with. A watched address is read the same way as a verified one.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        {walletConnectReady
          ? "WalletConnect is available for wallets that are not installed in this browser, including a phone wallet."
          : "WalletConnect is off until NEXT_PUBLIC_REOWN_PROJECT_ID is set. An installed MetaMask or Phantom wallet can still sign."}
      </p>
    </section>
  );
}
