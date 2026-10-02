import { WATCH_CHAIN_LABELS } from "./connections";

export const SETUP_FLOW = [
  {
    id: "wallet",
    mode: "watch",
    title: "Connect a wallet",
    lede: `Paste a public address on ${WATCH_CHAIN_LABELS}, or connect Ethereum, Solana, or Polygon and sign to prove you control it. No key is stored, and nothing can move funds.`,
    next: "/dashboard/setup?step=exchange",
    skip: "Skip wallet",
  },
  {
    id: "exchange",
    mode: "exchange_read",
    title: "Connect an exchange",
    lede: "Coinbase and Bybit can connect with OAuth. Other exchanges take a read-only API key. Nothing can trade or withdraw.",
    next: "/dashboard/setup?step=custodian",
    skip: "Skip exchange",
  },
  {
    id: "custodian",
    mode: "custodian_read",
    title: "Connect a custodian",
    lede: "The vault id, and a network when the vault has one. A viewer credential is not collected.",
    next: "/dashboard/setup?step=done",
    skip: "Skip custodian",
  },
] as const;

export type SetupStepId = (typeof SETUP_FLOW)[number]["id"] | "done";

export function setupStep(value: string | undefined): { id: SetupStepId; index: number } {
  if (value === "done") return { id: "done", index: SETUP_FLOW.length };
  const index = SETUP_FLOW.findIndex((step) => step.id === value);
  if (index === -1) return { id: "wallet", index: 0 };
  const step = SETUP_FLOW[index];
  return { id: step ? step.id : "wallet", index: step ? index : 0 };
}
