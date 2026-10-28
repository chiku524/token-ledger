import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormCard } from "./form-card";
import { InfoHint } from "./info-hint";
import { SectionHeader } from "./section-header";

const LONG =
  "Balances are read from the chain, not posted. Nothing here changes the books until you record an entry.";

function describedText(html: string, label: string): string {
  const id = new RegExp(`aria-label="${label}"[^>]*aria-describedby="([^"]+)"`).exec(html)?.[1];
  expect(id).toBeTruthy();
  const at = html.indexOf(`id="${id}"`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(at);
}

describe("InfoHint", () => {
  it("is a labelled button whose description is always in the page for screen readers", () => {
    const html = renderToStaticMarkup(<InfoHint title="Balances">{LONG}</InfoHint>);
    expect(html).toContain('<button type="button" aria-label="About Balances"');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain('class="sr-only"');
    expect(describedText(html, "About Balances")).toContain(LONG);
  });

  it("leaves the popover closed until it is hovered, focused or tapped", () => {
    const html = renderToStaticMarkup(<InfoHint title="Balances">{LONG}</InfoHint>);
    expect(html).not.toContain('data-slot="popover-content"');
    expect(html.split(LONG)).toHaveLength(2);
  });
});

describe("SectionHeader with a long description", () => {
  it("moves it into a hint beside the title and keeps the words", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Observed balances" description={LONG} />);
    expect(html).toMatch(/<h2[^>]*>Observed balances<\/h2>/);
    expect(html).toContain('aria-label="About Observed balances"');
    expect(describedText(html, "About Observed balances")).toContain(LONG);
    expect(html).not.toContain("<p ");
  });

  it("keeps a short subtitle under the title", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Balances" description="By account" />);
    expect(html).toContain("<p ");
    expect(html).toContain("By account");
    expect(html).not.toContain("info-hint");
  });

  it("keeps a long description with markup in a hint", () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        title="Valuation"
        description={
          <>
            Prices come from <b>saved quotes</b>. A holding with no quote is left out of the total.
          </>
        }
      />,
    );
    expect(html).toContain('aria-label="About Valuation"');
    expect(describedText(html, "About Valuation")).toContain("<b>saved quotes</b>");
  });
});

describe("FormCard", () => {
  it("moves a long description into a hint beside the title", () => {
    const html = renderToStaticMarkup(
      <FormCard title="Import activity" description={LONG}>
        <input name="x" />
      </FormCard>,
    );
    expect(html).toContain('aria-label="About Import activity"');
    expect(describedText(html, "About Import activity")).toContain(LONG);
    expect(html).not.toContain("<p ");
  });

  it("keeps a short description under the title", () => {
    const html = renderToStaticMarkup(
      <FormCard title="Add" description="One line.">
        <input name="x" />
      </FormCard>,
    );
    expect(html).toContain("One line.");
    expect(html).not.toContain("info-hint");
  });
});