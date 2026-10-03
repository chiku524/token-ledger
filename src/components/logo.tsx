import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoMark({ className = "h-[22px] w-auto" }: { className?: string }) {
  return (
    <Image
      src="/token-ledger-logo.svg"
      alt=""
      width={745}
      height={598}
      priority
      className={cn("object-contain drop-shadow-[0_1px_1px_rgb(70_80_140/0.45)] dark:drop-shadow-none", className)}
    />
  );
}

const sizes = {
  md: { gap: "gap-2.5", mark: "h-[22px] w-auto", text: "text-base" },
  sm: { gap: "gap-2", mark: "h-[17px] w-auto", text: "text-[13px]" },
};

export function Logo({ size = "md", className }: { size?: keyof typeof sizes; className?: string }) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <LogoMark className={s.mark} />
      <span className={cn("font-logo leading-none font-semibold whitespace-nowrap", s.text)}>Token Ledger</span>
    </span>
  );
}
