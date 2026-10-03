import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthShell } from "@/components/auth/auth-shell";
import { FadeIn, PageTransition } from "@/components/motion/fade-in";
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
    const html = renderToStaticMarkup(<FadeIn y={16} delay={0.1}>hero</FadeIn>);
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
});
