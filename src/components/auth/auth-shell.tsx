import Link from "next/link";
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
    <div className="min-h-full">
      <header className="page-width flex h-20 items-center justify-between">
        <Link href="/" aria-label="Token Ledger home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className={cn("page-width pt-6 pb-16", width === "narrow" && "max-w-xl")}>
        <FadeIn>
          <p className="eyebrow">{kicker}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          {children}
        </FadeIn>
      </main>
    </div>
  );
}

export function AuthSplit({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="mt-4 grid gap-8 md:grid-cols-2">
      <section>{children}</section>
      {aside}
    </div>
  );
}
