import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { exampleBooks } from "@/data/example-books";
import { financialStatements } from "@/ledger";
import { Flash } from "@/components/flash";
import { Logo } from "@/components/logo";
import { Amount } from "./amount";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { FinancialStatementsCards } from "./financial-statements";
import { SectionHeader } from "./section-header";
import { StatusBadge, connectionStatusTone } from "./status-badge";
import { EmptyRow } from "./table-cells";

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

  it("leaves a saved message to the toast", () => {
    expect(renderToStaticMarkup(<Flash saved="Saved" />)).toBe("");
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

describe("EmptyRow", () => {
  it("spans the table and centres a muted message", () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <EmptyRow colSpan={4}>Nothing here</EmptyRow>
        </tbody>
      </table>,
    );
    expect(html).toContain('colSpan="4"');
    expect(html).toContain("Nothing here");
    expect(html).toContain("text-center");
  });
});

describe("FinancialStatementsCards", () => {
  it("renders the Balance Sheet by class and the P&L for a company", () => {
    const MY = "ent_harbourline_my";
    const statements = financialStatements(
      exampleBooks.journalEntries,
      exampleBooks.accounts,
      exampleBooks.assets,
      MY,
    );
    const html = renderToStaticMarkup(<FinancialStatementsCards statements={statements} company="Harbourline" />);
    expect(html).toContain("Balance Sheet");
    expect(html).toContain("Profit &amp; Loss");
    expect(html).toContain("Stablecoins");
    expect(html).toContain("Total assets");
    expect(html).toContain("In balance");
    expect(html).toContain("Result for the period");
  });
});
