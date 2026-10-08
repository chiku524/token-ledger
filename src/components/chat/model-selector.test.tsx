import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The trigger is the only way an admin reaches the provider/model dropdown, so it
 * must render immediately — it must not depend on its own click (the bug: it
 * returned null until settings loaded, which only happened on click).
 */
vi.mock("@/app/dashboard/ai-actions", () => ({
  getAiSettingsAction: vi.fn(async () => ({ provider: "", model: "", customized: false, options: [] })),
  setAiSelectionAction: vi.fn(async () => ({ ok: true })),
  resetAiSelectionAction: vi.fn(async () => ({ ok: true })),
}));

import { ModelSelector } from "./model-selector";

describe("ModelSelector", () => {
  it("renders its trigger before any settings load", () => {
    const html = renderToStaticMarkup(<ModelSelector csrf="csrf" />);
    expect(html).toContain("Model");
    expect(html).toContain('aria-haspopup="true"');
  });
});
