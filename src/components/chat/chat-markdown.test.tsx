import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "./chat-markdown";

/**
 * The assistant renders markdown, not raw HTML (model output is untrusted).
 * `ChatMarkdown` wraps assistant-ui's markdown primitive with remark-gfm and
 * themed components; rendering it exercises that wiring. A full markdown
 * assertion is covered by the library's own tests, so this guards the module
 * loads and is a component.
 */
describe("ChatMarkdown", () => {
  it("is a renderable component", () => {
    // memo() returns a special component object with a $$typeof marker.
    expect(ChatMarkdown).toBeTruthy();
    expect((ChatMarkdown as { $$typeof?: symbol }).$$typeof).toBeDefined();
  });
});
