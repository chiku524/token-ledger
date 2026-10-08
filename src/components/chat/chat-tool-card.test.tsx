import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { ChatToolCard } from "./chat-tool-card";

function props(overrides: Partial<ToolCallMessagePartProps> = {}): ToolCallMessagePartProps {
  return {
    toolName: "post_journal",
    toolCallId: "aitc_1",
    args: {},
    argsText: "{}",
    status: { type: "complete" },
    addResult: vi.fn(),
    resume: vi.fn(),
    respondToApproval: vi.fn(async () => undefined),
    ...overrides,
  } as ToolCallMessagePartProps;
}

describe("ChatToolCard", () => {
  it("shows a pending write as a confirmation card with Confirm and Cancel", () => {
    const html = renderToStaticMarkup(<ChatToolCard {...props({ approval: { id: "aitc_1" } })} />);
    expect(html).toContain("Post journal");
    expect(html).toContain("needs your confirmation");
    expect(html).toContain("Confirm");
    expect(html).toContain("Cancel");
  });

  it("shows an approved gate as a receipt, not controls", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard {...props({ approval: { id: "aitc_1", approved: true }, result: { text: "Posted JE-1." } })} />,
    );
    expect(html).toContain("Confirmed");
    expect(html).not.toContain(">Cancel<");
  });

  it("shows a denied gate as a cancelled receipt", () => {
    const html = renderToStaticMarkup(<ChatToolCard {...props({ approval: { id: "aitc_1", approved: false } })} />);
    expect(html).toContain("Cancelled");
  });

  it("shows a settled read result and a deep link", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard {...props({ toolName: "list_reconciliation", result: { summary: "3 exceptions.", route: "/dashboard/reconciliation" } })} />,
    );
    expect(html).toContain("List exceptions");
    expect(html).toContain("3 exceptions.");
    expect(html).toContain("Open page");
  });
});
