import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, Building2, FileCheck2, Link2, Sprout } from "lucide-react";
import { content, exampleHref, navigation, signupHref } from "@/components/landing/content";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { LandingHeader } from "@/components/landing/landing-header";
import { Logo } from "@/components/logo";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { FadeIn } from "@/components/motion/fade-in";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const stepIcons = [Link2, FileCheck2, BarChart3];
const planIcons = [Sprout, Building2];

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only fixed top-3 left-3 z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <LandingHeader />

      <main id="main">
        <section
          id="product"
          className="page-width grid scroll-mt-24 items-center gap-12 pt-12 pb-16 sm:pt-16 lg:grid-cols-[0.95fr_1.15fr] lg:gap-10 lg:pt-14 lg:pb-20"
        >
          <FadeIn y={12}>
            <p className="eyebrow mb-6 max-w-sm leading-6">{content.eyebrow}</p>
            <h1 className="text-[clamp(2.8rem,5.1vw,4.55rem)] leading-[1.04] font-semibold tracking-[-0.06em]">
              <span className="block">{content.headline[0]}</span>
              <span className="block text-brand dark:text-primary">{content.headline[1]}</span>
            </h1>
            <p className="mt-7 max-w-[470px] text-sm leading-[1.85] text-muted-foreground sm:text-base">
              {content.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={exampleHref}>
                  {content.demoLabel}
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={signupHref}>
                  {content.signupLabel}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="mt-6 text-[11px] text-muted-foreground">{content.demoNote}</p>
          </FadeIn>
          <FadeIn y={16} delay={0.1}>
            <DashboardPreview />
          </FadeIn>
        </section>

        <div className="page-width">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-y py-6 text-[9px] font-medium tracking-[.2em] text-muted-foreground uppercase sm:gap-8 sm:text-[10px]">
            <span>
              Wallets <span className="px-2 text-border sm:px-4">/</span> Exchanges{" "}
              <span className="px-2 text-border sm:px-4">/</span> Custodians
            </span>
            <ArrowRight aria-hidden className="size-4" />
            <span>One ledger</span>
            <ArrowRight aria-hidden className="size-4" />
            <span>Accounting exports</span>
          </div>
        </div>

        <section id="how-it-works" className="page-width scroll-mt-24 py-16 sm:py-20">
          <p className="eyebrow mb-4">From holdings to reports</p>
          <h2 className="section-title">{content.workflowTitle}</h2>
          <Stagger className="mt-10 grid gap-8 md:grid-cols-3 md:gap-0">
            {content.steps.map((step, index) => {
              const Icon = stepIcons[index];
              const accent = index === 1;
              return (
                <StaggerItem
                  key={step.title}
                  className="flex gap-5 border-b pb-8 last:border-0 last:pb-0 md:border-r md:border-b-0 md:px-7 md:pb-0 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
                >
                  <div
                    className={cn(
                      "flex size-14 shrink-0 items-center justify-center rounded-xl",
                      accent ? "bg-primary text-primary-foreground" : "bg-brand text-brand-foreground",
                    )}
                  >
                    <Icon strokeWidth={1.7} className="size-6" aria-hidden />
                  </div>
                  <div>
                    <p className={cn("mb-1 font-mono text-sm", accent ? "text-brand dark:text-primary" : "text-link")}>
                      0{index + 1}
                    </p>
                    <h3 className="text-2xl font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-3 text-[13px] leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>

        <section id="plans" className="page-width scroll-mt-24">
          <div className="grid gap-9 border-t py-14 sm:py-16 md:grid-cols-[.85fr_1.25fr] md:gap-16">
            <div>
              <h2 className="section-title max-w-[360px]">{content.plansTitle}</h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{content.plansDescription}</p>
            </div>
            <Stagger className="space-y-3">
              {content.plans.map((plan, index) => {
                const Icon = planIcons[index];
                return (
                  <StaggerItem key={plan.name}>
                    <Card className="gap-0 py-0 shadow-none">
                      <CardContent className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 p-6 sm:grid-cols-[auto_130px_1fr]">
                        <Icon className="size-7" strokeWidth={1.5} aria-hidden />
                        <div>
                          <h3 className="text-lg font-medium">{plan.name}</h3>
                          <Badge variant="example" className="mt-2">
                            Planned
                          </Badge>
                        </div>
                        <p className="col-span-2 text-xs leading-6 text-muted-foreground sm:col-span-1">
                          {plan.description}
                        </p>
                      </CardContent>
                    </Card>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </section>

        <section className="page-width" aria-labelledby="cta-title">
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
            <Button asChild size="lg" className="shrink-0">
              <Link href={exampleHref}>
                {content.ctaLabel}
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="page-width flex flex-col items-start justify-between gap-6 py-8 sm:flex-row sm:items-center">
        <Link href="/" aria-label="Token Ledger home">
          <Logo />
        </Link>
        <p className="max-w-[280px] text-[11px] leading-5 text-muted-foreground">{content.footerNote}</p>
        <nav aria-label="Footer navigation" className="flex gap-5 text-[11px] text-muted-foreground">
          {navigation.map((item) => (
            <a key={item.href} className="hover:text-foreground" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </footer>
    </>
  );
}
