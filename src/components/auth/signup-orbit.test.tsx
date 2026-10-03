import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupOrbit } from "@/components/auth/signup-orbit";

describe("SignupOrbit", () => {
  it("renders marks with gather and float hooks, visible without motion", () => {
    const html = renderToStaticMarkup(<SignupOrbit />);
    expect(html).toContain("👛");
    expect(html).toContain("🏦");
    expect(html).toContain("🔐");
    expect(html).toContain("auth-orbit");
    expect(html).toContain("auth-gather");
    expect(html).toContain("auth-float");
    expect(html).toContain("auth-brand");
    expect(html).toContain("Token Ledger");
    expect(html).toContain("--to-x");
    expect(html).toContain("--orbit-delay");
    expect(html).not.toContain("opacity:0");
  });


  it("staggers marks so the gather reads as an ordered sweep", () => {
    const html = renderToStaticMarkup(<SignupOrbit />);
    expect(html).toContain("--orbit-delay:0.00s");
    expect(html).toContain("--orbit-delay:0.22s");
    expect(html).toContain("--orbit-delay:1.54s");
  });

  it("mounts only when the auth shell is given an ornament", () => {
    const withOrbit = renderToStaticMarkup(
      <AuthShell kicker="Create an account" title="Start" ornament={<SignupOrbit />}>
        wizard
      </AuthShell>,
    );
    const plain = renderToStaticMarkup(
      <AuthShell kicker="Sign in" title="Sign in">
        form
      </AuthShell>,
    );
    expect(withOrbit).toContain("👛");
    expect(withOrbit).toContain("wizard");
    expect(plain).not.toContain("👛");
    expect(plain).toContain("form");
  });

  it("keeps the shared orbit on sign-in with a teal-navy left panel", () => {
    const html = renderToStaticMarkup(
      <AuthShell kicker="Sign in" title="Sign in" tone="signin" ornament={<SignupOrbit />}>
        form
      </AuthShell>,
    );
    expect(html).toContain("👛");
    expect(html).toContain("auth-orbit");
    expect(html).toContain("bg-[#071824]");
    expect(html).toContain("#1a8fa3");
    expect(html).not.toContain("bg-[#0a0f2e]");
  });

  it("keeps the shared orbit on reset with a slate-indigo left panel", () => {
    const html = renderToStaticMarkup(
      <AuthShell kicker="Account" title="Reset" tone="reset" ornament={<SignupOrbit />}>
        form
      </AuthShell>,
    );
    expect(html).toContain("👛");
    expect(html).toContain("auth-orbit");
    expect(html).toContain("bg-[#0b1220]");
    expect(html).toContain("#5468a0");
    expect(html).not.toContain("bg-[#0a0f2e]");
    expect(html).not.toContain("bg-[#071824]");
  });
});
