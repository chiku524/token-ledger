import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthShell } from "@/components/auth/auth-shell";
import { Convergence } from "@/components/landing/convergence";
import { HeroScroll } from "@/components/landing/hero-scroll";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Institutions } from "@/components/landing/institutions";
import { Plans } from "@/components/landing/plans";
import { FadeIn, PageTransition } from "@/components/motion/fade-in";
import { Reveal } from "@/components/motion/reveal";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

describe("entrance animations", () => {
  it("server-renders route content visible", () => {
    const html = renderToStaticMarkup(<PageTransition>dashboard body</PageTransition>);
    expect(html).toContain("dashboard body");
    expect(html).not.toContain("opacity:0");
  });

  it("server-renders the auth shell visible", () => {
    const html = renderToStaticMarkup(
      <AuthShell kicker="Account" title="Sign in">
        sign-in form
      </AuthShell>,
    );
    expect(html).toContain("sign-in form");
    expect(html).not.toContain("opacity:0");
  });

  it("carries the rise distance and delay as style hooks", () => {
    const html = renderToStaticMarkup(
      <FadeIn y={16} delay={0.1}>
        hero
      </FadeIn>,
    );
    expect(html).toContain('class="rise-in"');
    expect(html).toContain("--rise-y:16px");
    expect(html).toContain("animation-delay:0.1s");
  });

  it("staggers direct children without hiding them", () => {
    const html = renderToStaticMarkup(
      <Stagger>
        <StaggerItem>one</StaggerItem>
        <StaggerItem>two</StaggerItem>
      </Stagger>,
    );
    expect(html).toContain('class="stagger"');
    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).not.toContain("opacity:0");
  });

  it("server-renders scroll reveals visible", () => {
    const html = renderToStaticMarkup(
      <>
        <Reveal>one</Reveal>
        <Reveal variant="stagger">two</Reveal>
        <Reveal variant="scale">three</Reveal>
      </>,
    );
    expect(html).toContain('class="reveal"');
    expect(html).toContain('class="reveal-stagger"');
    expect(html).toContain('class="reveal-scale"');
    expect(html).not.toContain("opacity:0");
  });

  it("server-renders the hero preview wrapper at rest", () => {
    const html = renderToStaticMarkup(<HeroScroll>preview</HeroScroll>);
    expect(html).toContain("preview");
    expect(html).not.toContain("opacity:0");
  });

  it("server-renders the convergence story as text", () => {
    const html = renderToStaticMarkup(<Convergence />);
    expect(html).toContain("Token Ledger brings them into one set of books.");
    expect(html).toContain("Xero");
    expect(html).toContain("Self-custody wallet");
  });

  it("server-renders how it works with every step visible", () => {
    const html = renderToStaticMarkup(<HowItWorks />);
    for (const title of ["Connect", "Reconcile", "Report"]) expect(html).toContain(title);
    expect(html).not.toContain("opacity:");
  });

  it("server-renders both plans visible", () => {
    const html = renderToStaticMarkup(<Plans />);
    expect(html).toContain("Startup");
    expect(html).toContain("Institutional");
    expect(html).not.toContain("opacity:0");
  });

  it("server-renders every institution card visible", () => {
    const html = renderToStaticMarkup(<Institutions />);
    for (const name of ["Banks", "Stablecoin issuers", "Asset managers"]) expect(html).toContain(name);
    expect(html).not.toContain("opacity:0");
  });
});
