import Link from "next/link";
import { AUTH_VISUAL_TONES, AuthVisual, type AuthVisualTone } from "@/components/auth/auth-visual";
import { Logo } from "@/components/logo";
import { FadeIn } from "@/components/motion/fade-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function AuthShell({
  kicker,
  title,
  width = "narrow",
  tone = "signup",
  ornament,
  children,
}: {
  kicker: string;
  title: string;
  width?: "narrow" | "wide";
  /** Left-panel atmosphere. Sign-up blue/purple, sign-in teal-navy, reset slate-indigo. */
  tone?: AuthVisualTone;
  /** Decorative content for the left panel. Hidden below the `lg` breakpoint. */
  ornament?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-h-dvh lg:grid-cols-2", AUTH_VISUAL_TONES[tone].base)}>
      <div className="sticky top-0 hidden h-dvh lg:block">
        <AuthVisual tone={tone}>{ornament}</AuthVisual>
      </div>
      <main className="relative z-10 flex min-h-dvh flex-col bg-background px-6 py-6 lg:-ml-10 lg:rounded-l-[2rem] lg:px-12">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className={cn("mx-auto my-auto w-full py-10", width === "narrow" ? "max-w-md" : "max-w-xl")}>
          <Link href="/" aria-label="Token Ledger home" className="mb-10 inline-flex">
            <Logo />
          </Link>
          <FadeIn>
            <p className="eyebrow">{kicker}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
            {children}
          </FadeIn>
        </div>
      </main>
    </div>
  );
}

export function AuthSplit({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="mt-4">
      <section>{children}</section>
      <hr className="my-8 border-border" />
      {aside}
    </div>
  );
}
