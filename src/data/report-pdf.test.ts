import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { entityReport } from "./entity-report";
import { exampleBooks } from "./example-books";
import { entityReportDocument, pdfSafe, reportPdf, type ReportDocument } from "./report-pdf";

const range = { from: exampleBooks.period.start, to: exampleBooks.period.end };
const entityId = exampleBooks.entities[0]!.id;

describe("report pdf", () => {
  it("leaves revaluation out unless requested", () => {
    expect(entityReport({ books: exampleBooks, entityId, range, includeRevaluation: false }).revaluation).toBeNull();
    expect(entityReport({ books: exampleBooks, entityId, range, includeRevaluation: true }).revaluation).not.toBeNull();
  });

  it("builds the same sections as the reports page", () => {
    const report = entityReport({ books: exampleBooks, entityId, range, includeRevaluation: true });
    const doc = entityReportDocument({ books: exampleBooks, entityId, range, report, generatedAt: new Date("2026-10-05T09:30:00Z") });
    expect(doc.title).toBe(exampleBooks.entities[0]!.name);
    expect(doc.details[1]).toContain("Generated 2026-10-05 09:30 UTC");
    expect(doc.charts.map((chart) => chart.rows)).toEqual([report.assetBars, report.composition]);
    expect(doc.tables.map((table) => table.title)).toEqual([
      "Account balances",
      "Crypto held",
      `Revaluation · ${exampleBooks.entities[0]!.functionalCurrency}`,
    ]);
    expect(doc.tables[0]!.rows).toHaveLength(report.balance.rows.length);
  });

  it("renders a loadable pdf from the example books", async () => {
    const report = entityReport({ books: exampleBooks, entityId, range, includeRevaluation: true });
    const bytes = await reportPdf(entityReportDocument({ books: exampleBooks, entityId, range, report, generatedAt: new Date() }));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("breaks long tables across pages", async () => {
    const doc: ReportDocument = {
      title: "Long − company 東京",
      details: [],
      charts: [],
      tables: [
        {
          title: "Account balances",
          columns: [{ label: "Code", width: 100 }, { label: "Net", width: 100, align: "right" }],
          rows: Array.from({ length: 120 }, (_, index) => [String(1000 + index), "−1.00"]),
          empty: "None",
        },
      ],
      notice: "",
    };
    const pdf = await PDFDocument.load(await reportPdf(doc));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("replaces characters the standard fonts cannot draw", () => {
    expect(pdfSafe("MYR −1.00 · 東京")).toBe("MYR -1.00 · ??");
  });
});
