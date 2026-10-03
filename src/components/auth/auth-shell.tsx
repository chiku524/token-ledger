import Link from "next/link";
import { AuthVisual } from "@/components/auth/auth-visual";
import { Logo } from "@/components/logo";
import { FadeIn } from "@/components/motion/fade-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function AuthShell({
  kicker,
  title,
  width = "narrow",
  children,
}: {
  kicker: string;
  title: string;
  width?: "narrow" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-[#0a0f2e] lg:grid-cols-2">
      <div className="sticky top-0 hidden h-dvh lg:block">
        <AuthVisual />
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
