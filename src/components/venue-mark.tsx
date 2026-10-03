import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact venue marks for the connect picker. These are simple brand-colored
 * monograms drawn for this app, not the exchanges' logo files.
 */
const MARKS: Record<string, { label: string; className: string }> = {
  wallet: { label: "W", className: "bg-muted text-foreground" },
  coinbase: { label: "C", className: "bg-[#0052FF] text-white" },
  bybit: { label: "B", className: "bg-[#F7A600] text-black" },
  binance: { label: "B", className: "bg-[#F3BA2F] text-black" },
  kraken: { label: "K", className: "bg-[#5741D9] text-white" },
  gemini: { label: "G", className: "bg-[#00DCFA] text-black" },
  okx: { label: "O", className: "bg-neutral-950 text-white" },
  kucoin: { label: "K", className: "bg-[#23AF91] text-white" },
  gate: { label: "G", className: "bg-[#17E6A1] text-black" },
  backpack: { label: "B", className: "bg-[#E33E3F] text-white" },
  fireblocks: { label: "F", className: "bg-[#FF6B2C] text-white" },
  bitgo: { label: "B", className: "bg-[#1B31FF] text-white" },
  ethereum: { label: "E", className: "bg-[#627EEA] text-white" },
  solana: { label: "S", className: "bg-gradient-to-br from-[#9945FF] to-[#14F195] text-white" },
  bitcoin: { label: "B", className: "bg-[#F7931A] text-white" },
  polygon: { label: "P", className: "bg-[#8247E5] text-white" },
  sui: { label: "S", className: "bg-[#4DA2FF] text-white" },
};

export function VenueMark({ id, className }: { id: string; className?: string }) {
  const mark = MARKS[id] ?? { label: id.slice(0, 1).toUpperCase(), className: "bg-muted text-foreground" };
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold", mark.className, className)}
    >
      {id === "wallet" ? <Wallet className="size-4" /> : id === "binance" ? <BinanceMark /> : mark.label}
    </span>
  );
}

function BinanceMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.8 14.4 5.2 12 7.6 9.6 5.2 12 2.8Zm0 13.6 2.4 2.4L12 21.2 9.6 18.8 12 16.4ZM18.8 9.6 21.2 12l-2.4 2.4L16.4 12l2.4-2.4ZM5.2 9.6 7.6 12 5.2 14.4 2.8 12l2.4-2.4Zm6.8-.8 3.2 3.2-3.2 3.2-3.2-3.2 3.2-3.2Z"
      />
    </svg>
  );
}
