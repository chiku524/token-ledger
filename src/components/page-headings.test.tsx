import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/page-header";
import { PageHeading } from "@/components/app/page-heading";

const LONG = "Fund a USDC vault for recurring access. Cancel or withdraw anytime, and a read-only wallet never enables spending.";

describe("PageHeader", () => {
  it("moves a long description into an info hint beside the title", () => {
    const html = renderToStaticMarkup(<PageHeader kicker="Page" title="Billing" description={LONG} />);
    expect(html).toContain('aria-label="About Billing"');
    expect(html).toContain(LONG);
    expect(html).not.toMatch(/<p [^>]*text-muted-foreground[^>]*>Fund a USDC/);
  });

  it("keeps a short description under the title", () => {
    const html = renderToStaticMarkup(<PageHeader kicker="Page" title="Users" description="Who can sign in." />);
    expect(html).not.toContain("aria-label=\"About");
    expect(html).toMatch(/<p [^>]*>Who can sign in\.<\/p>/);
  });

  it("renders without a description", () => {
    expect(renderToStaticMarkup(<PageHeader kicker="Page" title="Users" />)).not.toContain("About Users");
  });
});

describe("PageHeading", () => {
  it("moves a long description into an info hint beside the title", () => {
    const html = renderToStaticMarkup(<PageHeading title="Settings">{LONG}</PageHeading>);
    expect(html).toContain('aria-label="About Settings"');
    expect(html).toContain(LONG);
    expect(html).toContain("<h1");
  });

  it("keeps a short subtitle under the title", () => {
    const html = renderToStaticMarkup(<PageHeading title="Ledger">Posted entries</PageHeading>);
    expect(html).not.toContain("aria-label=\"About");
    expect(html).toMatch(/<p [^>]*>Posted entries<\/p>/);
  });
});