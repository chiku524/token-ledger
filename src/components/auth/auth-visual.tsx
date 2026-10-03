import { ShaderBackground } from "@/components/ui/valley-of-the-mind";
import { cn } from "@/lib/utils";

/** Shared left-panel atmospheres. Sign-in keeps the same motion, with a teal-navy cast. */
export const AUTH_VISUAL_TONES = {
  signup: {
    base: "bg-[#0a0f2e]",
    washes:
      "bg-[radial-gradient(60%_50%_at_25%_20%,#c7d2ff_0%,transparent_60%),radial-gradient(55%_55%_at_75%_45%,#2f5bff_0%,transparent_65%),radial-gradient(50%_45%_at_20%_80%,#0b1b8f_0%,transparent_70%)]",
    /** Built-in valley palette (purple / cyan / blue). */
    shaderColors: undefined as [number, number, number][] | undefined,
  },
  signin: {
    base: "bg-[#071824]",
    washes:
      "bg-[radial-gradient(60%_50%_at_25%_20%,#b8e4ef_0%,transparent_60%),radial-gradient(55%_55%_at_75%_45%,#1a8fa3_0%,transparent_65%),radial-gradient(50%_45%_at_20%_80%,#0a3d52_0%,transparent_70%)]",
    /** Deep teal-navy → mid teal → soft cyan → steel blue (no purple). */
    shaderColors: [
      [0.027, 0.094, 0.141],
      [0.039, 0.239, 0.322],
      [0.102, 0.561, 0.639],
      [0.22, 0.55, 0.78],
      [0.22, 0.55, 0.78],
      [0.22, 0.55, 0.78],
      [0.22, 0.55, 0.78],
      [0.22, 0.55, 0.78],
    ] as [number, number, number][],
  },
} as const;

export type AuthVisualTone = keyof typeof AUTH_VISUAL_TONES;

export function AuthVisual({
  children,
  tone = "signup",
}: {
  children?: React.ReactNode;
  tone?: AuthVisualTone;
}) {
  const palette = AUTH_VISUAL_TONES[tone];

  return (
    <div aria-hidden className={cn("relative h-full overflow-hidden", palette.base, palette.washes)}>
      <ShaderBackground className="absolute inset-0" colors={palette.shaderColors} />
      {children ? <div className="pointer-events-none absolute inset-0 z-[1]">{children}</div> : null}
      <div className="absolute bottom-8 left-8 right-[4.5rem] z-10 rounded-xl bg-white/10 p-5 text-xs leading-relaxed text-white/70 backdrop-blur-md">
        © Token Ledger. Read-only reconciliation: connections can read balances and history, and cannot move funds.
      </div>
    </div>
  );
}
