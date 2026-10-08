import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The panel needs a runtime provider (assistant-ui) which relies on client
 * hooks; we stub the runtime boundary and render the presentation directly so
 * the test stays a fast, jsdom-free render check of the launcher and states.
 */
vi.mock("./chat-runtime-provider", () => ({
  ChatRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ChatPanel } from "./chat-panel";

describe("ChatPanel", () => {
  it("renders a launcher button labelled Assistant", () => {
    const html = renderToStaticMarkup(<ChatPanel csrf="csrf" />);
    expect(html).toContain("Assistant");
    expect(html).toContain("Open the assistant");
  });

  it("renders the same launcher when the assistant is disabled", () => {
    const html = renderToStaticMarkup(<ChatPanel csrf="csrf" enabled={false} />);
    expect(html).toContain("Open the assistant");
  });
});
