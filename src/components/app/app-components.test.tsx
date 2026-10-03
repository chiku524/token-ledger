import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Flash } from "@/components/flash";
import { Logo } from "@/components/logo";
import { Amount } from "./amount";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { SectionHeader } from "./section-header";
import { StatusBadge, connectionStatusTone } from "./status-badge";

describe("connectionStatusTone", () => {
  it("maps health to a tone", () => {
    expect(connectionStatusTone("healthy")).toBe("success");
    expect(connectionStatusTone("degraded")).toBe("danger");
    expect(connectionStatusTone("pending")).toBe("neutral");
  });
});

describe("StatusBadge", () => {
  it("renders the label with the matching variant", () => {
    const html = renderToStaticMarkup(<StatusBadge tone="success">Healthy</StatusBadge>);
    expect(html).toContain("Healthy");
    expect(html).toContain('data-variant="success"');
  });
});

describe("Flash", () => {
  it("shows an error as an alert", () => {
    const html = renderToStaticMarkup(<Flash error="Nope" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nope");
  });

  it("shows a saved message as a status", () => {
    const html = renderToStaticMarkup(<Flash saved="Saved" />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("renders nothing when there is no message", () => {
    expect(renderToStaticMarkup(<Flash />)).toBe("");
  });
});

describe("Amount", () => {
  it("is monospaced and tinted by tone", () => {
    const html = renderToStaticMarkup(<Amount tone="danger">-1.00</Amount>);
    expect(html).toContain("font-mono");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("text-danger");
  });
});

describe("Field", () => {
  it("wraps the control in its label and shows an error", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" error="Required">
        <input name="name" />
      </Field>,
    );
    expect(html).toMatch(/<label[^>]*>.*Name.*<input name="name"\/>.*<\/label>/);
    expect(html).toContain("Required");
  });
});

describe("EmptyState and SectionHeader", () => {
  it("render their content", () => {
    expect(renderToStaticMarkup(<EmptyState>No entries.</EmptyState>)).toContain("No entries.");
    const header = renderToStaticMarkup(<SectionHeader title="Balances" description="By account" />);
    expect(header).toContain("<h2");
    expect(header).toContain("Balances");
    expect(header).toContain("By account");
  });
});

describe("Logo", () => {
  it("renders the name and the logo file", () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain("Token Ledger");
    expect(html).toContain("token-ledger-logo.svg");
  });
});
