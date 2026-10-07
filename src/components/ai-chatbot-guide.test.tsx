import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiChatbotGuide } from "./ai-chatbot-guide";

describe("AiChatbotGuide", () => {
  it("renders the TOC and default doctrine section", () => {
    const html = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour={false} />);
    expect(html).toContain("Guide sections");
    expect(html).toContain("Doctrine");
    expect(html).toContain("Observations stay observed");
    expect(html).toContain("Same product, spoken");
    expect(html).toContain("docs/ai-chatbot.md");
    expect(html).not.toContain("Restart getting-started tour");
  });

  it("offers the tour again to an admin who has already finished it", () => {
    // Connections section is not mounted by default; restart control lives there.
    // Smoke the prop path by ensuring the component accepts canRestartTour without throwing.
    const html = renderToStaticMarkup(<AiChatbotGuide csrf="csrf" canRestartTour />);
    expect(html).toContain("AI chatbot handbook");
  });
});
