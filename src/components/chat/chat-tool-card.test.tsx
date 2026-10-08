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

  it("renders the key fields, balanced lines and side effect from the preview", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard
        {...props({
          approval: { id: "aitc_1" },
          args: {
            preview: {
              action: "Post journal",
              fields: [
                { label: "Company", value: "Harbourline MY" },
                { label: "Amount", value: "100.00" },
              ],
              lines: [
                { accountCode: "1010", side: "debit", amount: "100.00" },
                { accountCode: "2010", side: "credit", amount: "100.00" },
              ],
              balanced: true,
              note: "Posted entries are immutable.",
            },
          },
        })}
      />,
    );
    expect(html).toContain("Harbourline MY");
    expect(html).toContain("1010");
    expect(html).toContain("Balanced");
    expect(html).toContain("immutable");
  });

  it("renders the on-chain plan and the signing handoff", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard
        {...props({
          toolName: "prepare_billing_deposit",
          approval: { id: "aitc_1" },
          args: {
            preview: {
              action: "Prepare billing deposit",
              fields: [{ label: "Amount (USDC)", value: "25" }],
              plan: {
                action: "billing.deposit",
                cluster: "devnet",
                programId: "GgYegKVx47vYApyQijG6g4k2pAGGJ6ub9DUhKUE4gZYo",
                feePayer: "Controller1111111111111111111111111111111111",
                instructions: 1,
              },
              note: "Deposits USDC into your vault.",
            },
          },
        })}
      />,
    );
    expect(html).toContain("Transaction to sign");
    expect(html).toContain("billing.deposit");
    expect(html).toContain("devnet");
    expect(html).toContain("never signs");
    expect(html).toContain("Billing");
  });

  it("shows an approved gate as a receipt, not controls", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard {...props({ approval: { id: "aitc_1", approved: true }, result: { text: "Posted JE-1." } })} />,
    );
    expect(html).toContain("Confirmed");
    expect(html).not.toContain(">Cancel<");
  });

  it("links to History after a confirmed write", () => {
    const html = renderToStaticMarkup(
      <ChatToolCard
        {...props({
          approval: { id: "aitc_1", approved: true },
          args: { approved: true, auditEventId: "audit_1", tool: "post_journal" },
          result: { text: "Posted JE-1." },
        })}
      />,
    );
    expect(html).toContain("View in History");
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
