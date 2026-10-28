import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { bannedTermsIn } from "@/test/banned-terms";
import { INDIVIDUAL_EXPORT_KINDS } from "./account-sections";
import { individualBooks as exampleBooks } from "@/test/individual-books";
import {
  INDIVIDUAL_CSV_HEADERS,
  INDIVIDUAL_REPORT_KINDS,
  INDIVIDUAL_REPORT_NAMES,
  INDIVIDUAL_REPORT_NOTICE,
  activityCsv,
  activityHistory,
  individualCurrency,
  individualReportFilename,
  portfolioCsv,
  portfolioSummary,
  safeCell,
  valueOverTime,
  valueOverTimeCsv,
} from "./individual-reports";
import { individualReportDocument, reportPdf, type ReportDocument } from "./report-pdf";

const range = { from: exampleBooks.period.start, to: exampleBooks.period.end };
const currency = individualCurrency(undefined, exampleBooks.entities[0]?.functionalCurrency);
const now = new Date("2026-10-05T09:30:00Z");

function documentText(doc: ReportDocument): string {
  return [
    doc.title,
    ...doc.details,
    doc.notice,
    ...doc.charts.flatMap((chart) => [chart.title, chart.empty, ...chart.rows.flatMap((row) => [row.label, row.formatted])]),
    ...doc.tables.flatMap((table) => [
      table.title,
      table.status ?? "",
      table.empty,
      ...table.columns.map((column) => column.label),
      ...table.rows.flat(),
      ...(table.footer ?? []),
      ...(table.notes ?? []),
    ]),
  ].join("\n");
}

describe("individual report kinds", () => {
  it("match the export kinds an individual may download", () => {
    expect([...INDIVIDUAL_REPORT_KINDS].sort()).toEqual([...INDIVIDUAL_EXPORT_KINDS].sort());
  });

  it("are named in plain language", () => {
    expect(INDIVIDUAL_REPORT_NAMES).toMatchObject({
      portfolio: "Portfolio summary",
      activity: "Activity history",
      valueOverTime: "Value over time",
    });
    expect(bannedTermsIn(`${Object.values(INDIVIDUAL_REPORT_NAMES).join(" ")} ${INDIVIDUAL_REPORT_NOTICE}`)).toEqual([]);
  });
});

describe("individual CSV downloads", () => {
  const summary = portfolioSummary(exampleBooks, { asOf: range.to, currency, now });
  const history = activityHistory(exampleBooks, range);
  const series = valueOverTime(exampleBooks, { range, currency, now });

  it.each([
    ["portfolio", () => portfolioCsv(exampleBooks, summary), INDIVIDUAL_CSV_HEADERS.portfolio],
    ["activity", () => activityCsv(exampleBooks, history), INDIVIDUAL_CSV_HEADERS.activity],
    ["value over time", () => valueOverTimeCsv(series), INDIVIDUAL_CSV_HEADERS.valueOverTime],
  ])("uses plain column names and no accounting terms in the %s CSV", (_name, build, headers) => {
    const csv = build();
    expect(csv.replace(/^\ufeff/, "").split(/\r?\n/)[0]).toBe(headers.join(","));
    expect(bannedTermsIn(csv)).toEqual([]);
  });

  it("uses the Date, Asset, Amount, Value and Account/Source columns the owner asked for", () => {
    const all = new Set<string>([...INDIVIDUAL_CSV_HEADERS.portfolio, ...INDIVIDUAL_CSV_HEADERS.activity, ...INDIVIDUAL_CSV_HEADERS.valueOverTime]);
    for (const column of ["Date", "Asset", "Amount", "Value", "Account/Source"]) expect(all.has(column)).toBe(true);
  });

  it("builds real rows from the example books", () => {
    expect(summary.rows.length).toBeGreaterThan(0);
    expect(history.transactions.length + history.balanceChanges.length).toBeGreaterThan(0);
  });

  it("keeps a spreadsheet from running a cell as a formula", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell("Wallet")).toBe("Wallet");
  });

  it.each(INDIVIDUAL_REPORT_KINDS)("names the %s file without accounting terms", (kind) => {
    const name = individualReportFilename(kind, range);
    expect(name).toMatch(/\.(csv|pdf)$/);
    expect(bannedTermsIn(name)).toEqual([]);
  });
});

describe("the individual PDF report", () => {
  const doc = individualReportDocument({ books: exampleBooks, range, currency, generatedAt: now });

  it("uses the plain section names", () => {
    expect(doc.title).toBe("Portfolio report");
    expect(doc.tables.map((table) => table.title)).toEqual([
      INDIVIDUAL_REPORT_NAMES.portfolio,
      INDIVIDUAL_REPORT_NAMES.activity,
      INDIVIDUAL_REPORT_NAMES.valueOverTime,
    ]);
  });

  it("contains no accounting terms", () => {
    expect(bannedTermsIn(documentText(doc))).toEqual([]);
  });

  it("renders a loadable PDF", async () => {
    const bytes = await reportPdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
