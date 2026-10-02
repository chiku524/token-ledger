"use client";

import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, polygon, solana } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { WagmiProvider, type Config } from "wagmi";
import type { OwnershipChain } from "@/auth/wallet-ownership";
import { signEvm, signSolana, type Eip1193Provider, type SolanaSigner } from "@/auth/wallet-signer";

let wagmiConfig: Config | undefined;
let queryClient: QueryClient | undefined;
let startedFor: string | undefined;

function ensureReown(projectId: string): Config {
  if (wagmiConfig && startedFor === projectId) return wagmiConfig;
  const wagmi = new WagmiAdapter({
    networks: [mainnet, polygon],
    projectId,
    ssr: true,
  });
  const solanaAdapter = new SolanaAdapter();
  createAppKit({
    adapters: [wagmi, solanaAdapter],
    networks: [mainnet, polygon, solana],
    defaultNetwork: mainnet,
    projectId,
    metadata: {
      name: "Token Ledger",
      description: "Verify control of a wallet. This connection cannot move funds.",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      send: false,
      receive: false,
      history: false,
    },
    themeMode: "light",
  });
  wagmiConfig = wagmi.wagmiConfig;
  startedFor = projectId;
  queryClient = new QueryClient();
  return wagmiConfig;
}

export function ReownConnect({
  projectId,
  chain,
  disabled,
  onProve,
}: {
  projectId: string;
  chain: OwnershipChain;
  disabled: boolean;
  onProve: (address: string, sign: (message: string) => Promise<string>) => Promise<void>;
}) {
  const config = useState(() => ensureReown(projectId))[0];
  if (!queryClient) return null;
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ReownButton chain={chain} disabled={disabled} onProve={onProve} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function ReownButton({
  chain,
  disabled,
  onProve,
}: {
  chain: OwnershipChain;
  disabled: boolean;
  onProve: (address: string, sign: (message: string) => Promise<string>) => Promise<void>;
}) {
  const namespace = chain === "solana" ? "solana" : "eip155";
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace });
  const { walletProvider } = useAppKitProvider<Eip1193Provider | SolanaSigner>(namespace);
  const [waiting, setWaiting] = useState(false);
  const pending = useRef(false);
  const onProveRef = useRef(onProve);
  useEffect(() => {
    onProveRef.current = onProve;
  });

  const signWith = useCallback(
    (currentAddress: string, provider: Eip1193Provider | SolanaSigner) => {
      return async (message: string) => {
        if (chain === "solana") return (await signSolana(provider as SolanaSigner, message)).signature;
        return signEvm(provider as Eip1193Provider, currentAddress, message);
      };
    },
    [chain],
  );

  useEffect(() => {
    if (!pending.current || !address || !walletProvider) return;
    pending.current = false;
    void onProveRef.current(address, signWith(address, walletProvider)).finally(() => setWaiting(false));
  }, [address, signWith, walletProvider]);

  async function connect() {
    setWaiting(true);
    if (isConnected && address && walletProvider) {
      try {
        await onProveRef.current(address, signWith(address, walletProvider));
      } finally {
        setWaiting(false);
      }
      return;
    }
    pending.current = true;
    await open({ view: "Connect" });
  }

  return (
    <button type="button" className="btn" disabled={disabled || waiting} onClick={() => void connect()}>
      {waiting ? "Waiting for WalletConnect" : "WalletConnect"}
    </button>
  );
}
