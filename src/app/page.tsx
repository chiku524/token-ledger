import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { content, exampleHref, navigation, signupHref } from "@/components/landing/content";
import { Convergence } from "@/components/landing/convergence";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { HeroScroll } from "@/components/landing/hero-scroll";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Institutions } from "@/components/landing/institutions";
import { LandingHeader } from "@/components/landing/landing-header";
import { Logo } from "@/components/logo";
import { FadeIn } from "@/components/motion/fade-in";
import { Reveal } from "@/components/motion/reveal";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <SmoothScroll>
      <a
        href="#main"
        data-print="hide"
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-md bg-primary px-4 py-3 text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <LandingHeader />

      <main id="main">
        <section
          id="product"
          className="page-width grid scroll-mt-24 items-center gap-12 pt-20 pb-16 sm:pt-24 lg:grid-cols-[0.95fr_1.15fr] lg:gap-10 lg:pt-[5.5rem] lg:pb-20"
        >
          <div>
            <FadeIn y={12}>
              <p className="eyebrow mb-6 max-w-sm leading-6">{content.eyebrow}</p>
            </FadeIn>
            <h1 className="text-[clamp(2.1rem,3.6vw,3.25rem)] leading-[1.1] font-semibold tracking-[-0.05em] text-balance">
              <span className="line-mask">
                <span className="line-rise">{content.headline[0]}</span>
              </span>{" "}
              <span className="line-mask">
                <span
                  className="line-rise text-brand dark:text-primary"
                  style={{ "--line-delay": "90ms" } as React.CSSProperties}
                >
                  {content.headline[1]}
                </span>
              </span>
            </h1>
            <FadeIn y={12} delay={0.35}>
              <p className="mt-7 max-w-[470px] text-sm leading-[1.85] text-muted-foreground sm:text-base">
                {content.description}
              </p>
            </FadeIn>
            <FadeIn y={12} delay={0.45}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="group active:scale-[0.98]">
                  <Link href={exampleHref}>
                    {content.demoLabel}
                    <ArrowUpRight
                      aria-hidden
                      className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="group active:scale-[0.98]">
                  <Link href={signupHref}>
                    {content.signupLabel}
                    <ArrowRight aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </FadeIn>
          </div>
          <HeroScroll>
            <DashboardPreview />
          </HeroScroll>
        </section>

        <Convergence />

        <Institutions />

        <HowItWorks />

        <section className="page-width" aria-labelledby="cta-title">
          <Reveal variant="scale">
            <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-brand px-7 py-10 text-brand-foreground sm:px-10 lg:flex-row lg:items-center">
              <div>
                <p className="mb-3 text-[10px] font-semibold tracking-[.23em] text-white/80 uppercase">Get started</p>
                <h2
                  id="cta-title"
                  className="max-w-2xl font-heading text-3xl leading-tight font-semibold tracking-[-.045em] sm:text-4xl"
                >
                  {content.ctaTitle}
                </h2>
              </div>
              <Button asChild size="lg" className="group shrink-0 active:scale-[0.98]">
                <Link href={exampleHref}>
                  {content.ctaLabel}
                  <ArrowUpRight
                    aria-hidden
                    className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="page-width flex flex-col items-start justify-between gap-6 py-8 sm:flex-row sm:items-center">
        <Link href="/" aria-label="Token Ledger home">
          <Logo />
        </Link>
        <nav aria-label="Footer navigation" className="flex gap-5 text-[11px] text-muted-foreground">
          {navigation.map((item) => (
            <a key={item.href} className="hover:text-foreground" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </footer>
    </SmoothScroll>
  );
}
