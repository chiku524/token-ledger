import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionGuide, GUIDE_SECTIONS } from "./connection-guide";

describe("GUIDE_SECTIONS", () => {
  it("follows the getting started onboarding order", () => {
    expect(GUIDE_SECTIONS.map((section) => section.id)).toEqual(["connect", "check", "balances", "next"]);
    expect(GUIDE_SECTIONS.map((section) => section.label)).toEqual(["Connect", "Check", "Balances", "Next"]);
  });
});

describe("ConnectionGuide", () => {
  it("shows a TOC and only the Connect section body by default", () => {
    const html = renderToStaticMarkup(<ConnectionGuide csrf="csrf" canRestartTour={false} />);
    expect(html).toContain("On this page");
    expect(html).toContain('aria-label="Guide sections"');
    expect(html).toContain('id="modes-heading"');
    expect(html).toContain("Watch-only wallet");
    expect(html).toContain("Verified means the sign-in controlled the address.");
    expect(html).toContain("Exchange, read-only");
    expect(html).toContain("Custodian, read-only");
    // Other section bodies stay unmounted until selected (TOC still lists their titles).
    expect(html).not.toContain('id="life-heading"');
    expect(html).not.toContain('id="shape-heading"');
    expect(html).not.toContain('id="roles-heading"');
    expect(html).not.toContain("Take the getting started guide");
  });

  it("offers the getting started guide again on the Next section", () => {
    const html = renderToStaticMarkup(
      <ConnectionGuide csrf="csrf" canRestartTour initialSection="next" />,
    );
    expect(html).toContain('id="roles-heading"');
    expect(html).toContain("Take the getting started guide");
    expect(html).not.toContain('id="modes-heading"');
  });

  it("shows only Check content when that section is selected", () => {
    const html = renderToStaticMarkup(
      <ConnectionGuide csrf="csrf" canRestartTour={false} initialSection="check" />,
    );
    expect(html).toContain('id="life-heading"');
    expect(html).toContain("Waiting");
    expect(html).toContain("Disconnected");
    expect(html).toContain("still need Check before Holdings fills");
    expect(html).toContain("Connected Coinbase but see no coins?");
    expect(html).not.toContain("Watch-only wallet");
    expect(html).not.toContain('id="shape-heading"');
  });

  it("shows only Balances content when that section is selected", () => {
    const html = renderToStaticMarkup(
      <ConnectionGuide csrf="csrf" canRestartTour={false} initialSection="balances" />,
    );
    expect(html).toContain('id="shape-heading"');
    expect(html).toContain("Observed balance");
    expect(html).toContain("A check never posts one.");
    expect(html).toContain("Looking for coins under Settings or Overview?");
    expect(html).not.toContain("Watch-only wallet");
    expect(html).not.toContain('id="life-heading"');
  });

  it("keeps practical depth on Connect without mounting other sections", () => {
    const html = renderToStaticMarkup(<ConnectionGuide csrf="csrf" canRestartTour={false} />);
    expect(html).toContain("Common pitfalls");
    expect(html).toContain("Saving Coinbase");
    expect(html).toContain("does not import balances yet");
    expect(html).not.toContain('id="roles-heading"');
  });
});
