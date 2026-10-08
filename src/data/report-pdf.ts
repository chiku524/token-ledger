import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { netBalanceMinor } from "@/ledger";
import type { Books } from "./books";
import type { MoneyRow } from "./charts";
import type { EntityReport } from "./entity-report";
import type { DateRange } from "./period";
import { formatMoney, formatQuantity, valuationLabel } from "./present";

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
