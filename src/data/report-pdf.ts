import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { netBalanceMinor } from "@/ledger";
import type { Books } from "./books";
import type { MoneyRow } from "./charts";
import type { EntityReport } from "./entity-report";
import type { DateRange } from "./period";
import { formatMoney, formatQuantity, valuationLabel } from "./present";
import {
  INDIVIDUAL_REPORT_NAMES,
  INDIVIDUAL_REPORT_NOTICE,
  activityHistory,
  portfolioSummary,
  valueOverTime,
} from "./individual-reports";

export interface ReportColumn {
  label: string;
  width: number;
  align?: "left" | "right";
}

export interface ReportTable {
  title: string;
  status?: string;
  columns: ReportColumn[];
  rows: string[][];
  footer?: string[];
  empty: string;
  notes?: string[];
}

export interface ReportChart {
  title: string;
  rows: MoneyRow[];
  empty: string;
}

export interface ReportDocument {
  title: string;
  details: string[];
  charts: ReportChart[];
  tables: ReportTable[];
  notice: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN + 24;
const ROW_HEIGHT = 16;
const INK = rgb(0.047, 0.059, 0.122);
const SOFT = rgb(0.294, 0.325, 0.408);
const LINE = rgb(0.839, 0.855, 0.902);
const BAR = rgb(0.231, 0.341, 0.776);

const WIN_ANSI_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function pdfSafe(text: string): string {
  return [...text.replaceAll("−", "-").replace(/\s/g, " ")]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.includes(char)) return char;
      return "?";
    })
    .join("");
}

export function entityReportDocument(input: {
  books: Books;
  entityId: string;
  range: DateRange;
  report: EntityReport;
  generatedAt: Date;
}): ReportDocument {
  const { books, report } = input;
  const entity = books.entities.find((item) => item.id === input.entityId);
  if (!entity) throw new Error(`Unknown company ${input.entityId}.`);
  const { balance, carrying, revaluation } = report;
  const currency = entity.functionalCurrency;
  const money = (amount: bigint) => (balance.currency ? formatMoney(amount, balance.currency) : "");
  const unsigned = (amount: bigint) => formatMoney(amount < 0n ? -amount : amount, currency);

  const tables: ReportTable[] = [
    {
      title: "Account balances",
      status:
        balance.rows.length === 0
          ? "No accounts"
          : `${report.balanced ? "Debits equal credits" : "Out of balance"}${balance.currency ? ` · ${money(balance.debitTotal)}` : ""}`,
      columns: [
        { label: "Code", width: 34 },
        { label: "Account", width: 115 },
        { label: "What it holds", width: 90 },
        { label: "Debit", width: 87, align: "right" },
        { label: "Credit", width: 87, align: "right" },
        { label: "Net", width: CONTENT_WIDTH - 413, align: "right" },
      ],
      rows: balance.rows.map((row) => [
        row.code,
        row.name,
        valuationLabel(row.measurementBasis),
        row.debitMinor > 0n ? money(row.debitMinor) : "",
        row.creditMinor > 0n ? money(row.creditMinor) : "",
        money(netBalanceMinor(row)),
      ]),
      footer: balance.rows.length > 0 ? ["", "Total", "", money(balance.debitTotal), money(balance.creditTotal), ""] : undefined,
      empty: "No accounts for this company.",
    },
    {
      title: "Crypto held",
      columns: [
        { label: "Asset", width: 80 },
        { label: "Held as", width: 160 },
        { label: "Amount", width: 120, align: "right" },
        { label: "Value", width: CONTENT_WIDTH - 360, align: "right" },
      ],
      rows: carrying.map((row) => [
        row.assetCode,
        valuationLabel(row.measurementBasis),
        formatQuantity(row.quantityMinor, row.assetCode, books.assets),
        formatMoney(row.carryingMinor, row.currency),
      ]),
      empty: "No journaled crypto yet.",
    },
  ];

  if (revaluation) {
    const notes: string[] = [];
    if (revaluation.staleAssetCodes.length > 0) notes.push("Some prices are stale; treat the proposal as provisional.");
    if (revaluation.unpriced.length > 0) notes.push(`Not priced, so left out: ${revaluation.unpriced.join(", ")}.`);
    tables.push({
      title: `Revaluation · ${currency}`,
      columns: [
        { label: "Asset", width: 100 },
        { label: "Carrying", width: 130, align: "right" },
        { label: "Market", width: 130, align: "right" },
        { label: "Difference", width: CONTENT_WIDTH - 360, align: "right" },
      ],
      rows: revaluation.lines.map((line) => [
        line.assetCode,
        formatMoney(line.carryingMinor, currency),
        formatMoney(line.marketMinor, currency),
        `${line.differenceMinor < 0n ? "-" : "+"}${unsigned(line.differenceMinor)}`,
      ]),
      footer:
        revaluation.lines.length > 0
          ? [`Net ${revaluation.netMinor >= 0n ? "gain" : "loss"}`, "", "", unsigned(revaluation.netMinor)]
          : undefined,
      empty: "Nothing to revalue at these prices, or no priced holdings.",
      notes,
    });
  }

  return {
    title: entity.name,
    details: [
      `Reports · ${input.range.from} – ${input.range.to} · ${entity.reportingFramework} · ${currency}`,
      `${books.organization.name} · Generated ${input.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`,
    ],
    charts: [
      { title: `Value · ${currency}`, rows: report.assetBars, empty: "No crypto values in these dates." },
      { title: "Accounts", rows: report.composition, empty: "No account activity in these dates." },
    ],
    tables,
    notice: books.notice,
  };
}

/** Rows of activity the PDF lists. The CSV download holds every row. */
const PDF_ACTIVITY_ROWS = 150;

/**
 * The PDF an individual downloads: what they hold, what moved, and what it was
 * worth. Plain words only, built from the same loaders as the Reports page.
 */
export function individualReportDocument(input: {
  books: Books;
  range: DateRange;
  currency: string;
  generatedAt: Date;
}): ReportDocument {
  const { books, range, currency } = input;
  const summary = portfolioSummary(books, { asOf: range.to, currency, now: input.generatedAt });
  const history = activityHistory(books, range);
  const series = valueOverTime(books, { range, currency, now: input.generatedAt });
  const activity = [...history.transactions, ...history.balanceChanges].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );

  const portfolioNotes: string[] = [];
  if (summary.partial) portfolioNotes.push("Some holdings have no price or an old one, so treat the total as an estimate.");
  if (summary.unpriced.length > 0) {
    portfolioNotes.push(`No price, so left out of the total: ${summary.unpriced.map((row) => row.assetCode).join(", ")}.`);
  }
  const activityNotes: string[] = [];
  if (activity.length > PDF_ACTIVITY_ROWS) {
    activityNotes.push(`Showing the latest ${PDF_ACTIVITY_ROWS} of ${activity.length}. Download the activity history to get every row.`);
  }
  const skippedNotes =
    series.skipped > 0
      ? [`${series.skipped} ${series.skipped === 1 ? "day was" : "days were"} left out because a holding had no saved price yet.`]
      : [];

  return {
    title: "Portfolio report",
    details: [
      `${range.from} - ${range.to} \u00b7 Values in ${currency}`,
      `${books.organization.name} \u00b7 Generated ${input.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`,
    ],
    charts: [
      {
        title: `Allocation \u00b7 ${currency}`,
        rows: summary.rows.map((row) => ({
          id: row.assetCode,
          label: row.assetCode,
          value: Number(row.valueMinor) / 100,
          formatted: `${row.value} \u00b7 ${row.shareLabel}`,
        })),
        empty: "No holdings in these dates.",
      },
    ],
    tables: [
      {
        title: INDIVIDUAL_REPORT_NAMES.portfolio,
        status: `As of ${range.to}`,
        columns: [
          { label: "Asset", width: 90 },
          { label: "Amount", width: 150, align: "right" },
          { label: "Value", width: 150, align: "right" },
          { label: "Share", width: CONTENT_WIDTH - 390, align: "right" },
        ],
        rows: summary.rows.map((row) => [row.assetCode, row.amount, row.value, row.shareLabel]),
        footer: summary.rows.length > 0 ? ["Total", "", summary.total, ""] : undefined,
        empty: "No holdings yet.",
        notes: portfolioNotes,
      },
      {
        title: INDIVIDUAL_REPORT_NAMES.activity,
        status: `${range.from} - ${range.to}`,
        columns: [
          { label: "Date", width: 58 },
          { label: "Type", width: 66 },
          { label: "Asset", width: 46 },
          { label: "Amount", width: 100, align: "right" },
          { label: "Account/Source", width: 110 },
          { label: "Note", width: CONTENT_WIDTH - 380 },
        ],
        rows: activity.slice(0, PDF_ACTIVITY_ROWS).map((row) => [row.date, row.type, row.assetCode, row.amount, row.source, row.note]),
        empty: "No activity in these dates.",
        notes: activityNotes,
      },
      {
        title: INDIVIDUAL_REPORT_NAMES.valueOverTime,
        status: currency,
        columns: [
          { label: "Date", width: 120 },
          { label: "Value", width: CONTENT_WIDTH - 120, align: "right" },
        ],
        rows: [...series.points].reverse().map((point) => [point.date, point.value]),
        empty: "Not enough history yet.",
        notes: skippedNotes,
      },
    ],
    notice: INDIVIDUAL_REPORT_NOTICE,
  };
}

export async function reportPdf(doc: ReportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`${doc.title} report`));
  pdf.setCreator("Token Ledger");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (value: string, x: number, size: number, font: PDFFont = regular, color = INK) =>
    page.drawText(pdfSafe(value), { x, y, size, font, color });
  const ensure = (height: number) => {
    if (y - height >= BOTTOM) return false;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    return true;
  };
  const rule = () => page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: LINE });
  const heading = (title: string, status?: string) => {
    ensure(ROW_HEIGHT * 4);
    y -= 22;
    text(title, MARGIN, 12, bold);
    if (status) {
      const label = pdfSafe(status);
      page.drawText(label, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8.5), y, size: 8.5, font: regular, color: SOFT });
    }
    y -= 10;
  };
  const paragraph = (value: string, size = 8.5, color = SOFT) => {
    for (const line of wrap(pdfSafe(value), regular, size, CONTENT_WIDTH)) {
      ensure(size + 4);
      y -= size + 4;
      page.drawText(line, { x: MARGIN, y, size, font: regular, color });
    }
  };

  y -= 18;
  text(doc.title, MARGIN, 18, bold);
  for (const detail of doc.details) {
    y -= 14;
    text(detail, MARGIN, 9, regular, SOFT);
  }
  y -= 10;
  rule();

  for (const chart of doc.charts) {
    heading(chart.title);
    if (chart.rows.length === 0) {
      paragraph(chart.empty);
      continue;
    }
    const max = Math.max(...chart.rows.map((row) => Math.abs(row.value)), 1);
    const labelWidth = 90;
    const amountWidth = 150;
    const barSpace = CONTENT_WIDTH - labelWidth - amountWidth - 12;
    for (const row of chart.rows) {
      ensure(ROW_HEIGHT);
      y -= ROW_HEIGHT;
      text(fit(row.label, regular, 8.5, labelWidth - 6), MARGIN, 8.5);
      page.drawRectangle({
        x: MARGIN + labelWidth,
        y: y - 2,
        width: Math.max((Math.abs(row.value) / max) * barSpace, 1),
        height: 9,
        color: BAR,
      });
      text(fit(row.formatted, regular, 8.5, amountWidth), MARGIN + labelWidth + barSpace + 12, 8.5, regular, SOFT);
    }
    y -= 6;
  }

  for (const table of doc.tables) {
    heading(table.title, table.status);
    const header = () => {
      y -= ROW_HEIGHT;
      drawRow(page, y, table.columns, table.columns.map((column) => column.label), bold, SOFT);
      y -= 5;
      rule();
    };
    header();
    if (table.rows.length === 0) {
      paragraph(table.empty);
    }
    for (const row of table.rows) {
      if (ensure(ROW_HEIGHT)) header();
      y -= ROW_HEIGHT;
      drawRow(page, y, table.columns, row, regular, INK);
    }
    if (table.footer) {
      if (ensure(ROW_HEIGHT + 6)) header();
      y -= 5;
      rule();
      y -= ROW_HEIGHT;
      drawRow(page, y, table.columns, table.footer, bold, INK);
    }
    for (const note of table.notes ?? []) paragraph(note);
    y -= 6;
  }

  y -= 10;
  paragraph(doc.notice);

  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    const label = `${pdfSafe(doc.title)} · Page ${index + 1} of ${pages.length}`;
    target.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 7.5),
      y: MARGIN - 12,
      size: 7.5,
      font: regular,
      color: SOFT,
    });
  });

  return pdf.save();
}

function drawRow(page: PDFPage, y: number, columns: ReportColumn[], cells: string[], font: PDFFont, color: ReturnType<typeof rgb>) {
  let x = MARGIN;
  columns.forEach((column, index) => {
    const size = 8.5;
    const value = fit(pdfSafe(cells[index] ?? ""), font, size, column.width - 6);
    const offset = column.align === "right" ? column.width - font.widthOfTextAtSize(value, size) : 0;
    page.drawText(value, { x: x + offset, y, size, font, color });
    x += column.width;
  });
}

function fit(value: string, font: PDFFont, size: number, width: number): string {
  const safe = pdfSafe(value);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let end = safe.length;
  while (end > 0 && font.widthOfTextAtSize(`${safe.slice(0, end)}…`, size) > width) end -= 1;
  return `${safe.slice(0, end)}…`;
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
