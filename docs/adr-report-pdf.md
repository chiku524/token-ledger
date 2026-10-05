# ADR: Server-generated PDF report

Status: accepted.

## Context

The Reports page already exports CSVs for balances, journal, and matching.
Users also want a report they can print or file. The PDF must match the screen
and must build on every deploy target: Vercel/Node, the container image, and
Cloudflare Workers (OpenNext).

## Decision

- **Download report** on `/dashboard/reports` calls
  `/dashboard/reports/export?kind=pdf` with the same company and dates as the
  CSV buttons. It uses the same `books.export` permission and entity-scope
  checks.
- The PDF is drawn with **pdf-lib**. It is pure JavaScript with no filesystem,
  native, or WASM dependency, so it runs unchanged on Node and Workerd. pdfkit
  was rejected because it reads font metrics from disk. `@react-pdf/renderer`
  was rejected because it pulls in yoga/WASM and is a heavy, untested bundle on
  Workers.
- The page and the PDF share one data function, `entityReport`
  (`src/data/entity-report.ts`), so the figures cannot drift apart.
  `entityReportDocument` turns that data into formatted rows, and `reportPdf`
  (`src/data/report-pdf.ts`) draws them.
- The PDF contains:
  - a header (company, period, framework, currency, organisation, generation
    time in UTC)
  - the two bar charts
  - Account balances with totals
  - Crypto held
  - Revaluation, only for users who see it on the page (`journal.post`,
    writable books, not demo)
  - the books notice
  - a "Page X of Y" footer

  Long tables break across pages and repeat their header row.

## Consequences

- Text uses the built-in Helvetica fonts, which only cover WinAnsi (Latin-1).
  `pdfSafe` swaps `−` for `-` and replaces any other character it cannot encode
  with `?`. Company or account names in non-Latin scripts will not render.
  Embedding a TTF through `@pdf-lib/fontkit` is the fix if that is ever needed.
- The charts are redrawn as plain bars, not copied from the Recharts output on
  screen, so they show the same figures but are not pixel-identical.
- The Combined page has no PDF yet.
