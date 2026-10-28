import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hiddenSectionsIn } from "@/test/hidden-sections";
import { AiChatbotGuide } from "./ai-chatbot-guide";

describe("AiChatbotGuide", () => {
  it("renders the TOC and default doctrine section", () => {
    const html = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour={false} />);
    expect(html).toContain("Guide sections");
    expect(html).toContain("Doctrine");
    expect(html).toContain("Observations stay observed");
    expect(html).toContain("Same product, spoken");
    expect(html).not.toContain("Restart getting-started tour");
  });

  it("offers the tour again to an admin who has already finished it", () => {
    const html = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour />);
    expect(html).toContain("Restart getting-started tour");
  });
});

describe("AiChatbotGuide for an individual", () => {
  const html = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour accountType="individual" />);

  it("mentions and links to no hidden section", () => {
    expect(hiddenSectionsIn(html)).toEqual([]);
    expect(html).not.toMatch(/period close|Journal/);
  });

  it("still shows the guide and the tour restart, with the Activity path", () => {
    expect(html).toContain("Guide sections");
    expect(html).toContain("Restart getting-started tour");
    expect(html).toContain("Connect \u2192 Check \u2192 Balances \u2192 Activity \u2192 Reports");
  });

  it("leaves the organization guide unchanged", () => {
    const organization = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour accountType="organization" />);
    expect(organization).toBe(renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour />));
    expect(organization).toMatch(/Matching/);
  });
});
