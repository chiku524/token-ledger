import { ShaderBackground } from "@/components/ui/valley-of-the-mind";

export function AuthVisual() {
  return (
    <div
      aria-hidden
      className="relative h-full overflow-hidden bg-[#0a0f2e] bg-[radial-gradient(60%_50%_at_25%_20%,#c7d2ff_0%,transparent_60%),radial-gradient(55%_55%_at_75%_45%,#2f5bff_0%,transparent_65%),radial-gradient(50%_45%_at_20%_80%,#0b1b8f_0%,transparent_70%)]"
    >
      <ShaderBackground className="absolute inset-0" />
      <div className="absolute bottom-8 left-8 right-[4.5rem] z-10 rounded-xl bg-white/10 p-5 text-xs leading-relaxed text-white/70 backdrop-blur-md">
        © Token Ledger. Read-only reconciliation: connections can read balances and history, and cannot move funds.
      </div>
    </div>
  );
}
