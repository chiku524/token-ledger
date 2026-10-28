import { getSession } from "@/auth/current";
import { isExportKindAllowed, isIndividualAccount } from "@/data/account-sections";
import { can, canAccessEntity } from "@/auth/roles";
import { formatMinor, journalCsv, netBalanceMinor, reconciliationCsv, trialBalance, trialBalanceCsv } from "@/ledger";
import { booksForSession } from "@/data/authorized-books";
import { defaultActivityRange, parseDateRange } from "@/data/period";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, sourceName } from "@/data/present";
import { canRevalue, entityReport } from "@/data/entity-report";
import { entityReportDocument, individualReportDocument, reportPdf } from "@/data/report-pdf";
import type { Books } from "@/data/books";
import type { DateRange } from "@/data/period";
import {
  activityCsv,
  activityHistory,
  individualCurrency,
  individualReportFilename,
  portfolioCsv,
  portfolioSummary,
  valueOverTime,
  valueOverTimeCsv,
  type IndividualReportKind,
} from "@/data/individual-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "books.export")) {
    return new Response("Sign in to export.", { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  // An individual downloads only the plain reports; the accounting exports are not theirs.
  if (!isExportKindAllowed(session.accountType, kind)) return new Response("That export is not part of this account.", { status: 404 });
  const books = await booksForSession(session);
  const requestedEntity = url.searchParams.get("entity");
  if (requestedEntity && !canAccessEntity(session, requestedEntity)) {
    return new Response("That company is outside your access.", { status: 403 });
  }
  const parsed = parseDateRange(
    { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined },
    isIndividualAccount(session.accountType) ? defaultActivityRange(books) : { from: books.period.start, to: books.period.end },
  );
  if (!parsed.ok) return new Response(parsed.message, { status: 400 });
  if (isIndividualAccount(session.accountType)) {
    return individualExport(kind as IndividualReportKind, books, parsed.range, url.searchParams.get("currency") ?? undefined);
  }
  const scoped = sliceBooks(books, parsed.range);
  const entity = books.entities.find((item) => item.id === url.searchParams.get("entity")) ?? books.entities[0];

  if (kind === "trial-balance") {
    if (!entity) return new Response("No company.", { status: 404 });
    const balance = trialBalance(scoped.journalEntries, books.accounts, entity.id);
    const body = trialBalanceCsv({
      entityName: entity.name,
      currency: balance.currency,
      rows: balance.rows.map((row) => ({
        code: row.code,
        name: row.name,
        debitMinor: row.debitMinor,
        creditMinor: row.creditMinor,
        netMinor: netBalanceMinor(row),
      })),
      formatAmount: (amount) => formatMinor(amount, 2, { minFraction: 2, maxFraction: 2, grouping: false }),
    });
    return csv(body, `trial-balance-${entity.functionalCurrency}.csv`);
  }

  if (kind === "journal") {
    const rows = scoped.journalEntries.flatMap((entry) =>
      entry.lines.map((line) => ({
        entryDate: entry.entryDate,
        reference: entry.reference,
        entityName: entityName(entry.entityId, books.entities),
        currency: entry.currency,
        accountCode: line.accountCode,
        accountName: accountLabel(entry.entityId, line.accountCode, books.accounts).replace(`${line.accountCode} `, ""),
        side: line.side,
        amount: formatMinor(line.amountMinor, 2, { minFraction: 2, maxFraction: 2, grouping: false }),
        assetCode: line.assetCode ?? "",
        quantity: line.quantityMinor !== undefined && line.assetCode
          ? formatMinor(line.quantityMinor, books.assets.find((asset) => asset.code === line.assetCode)?.decimals ?? 0, { grouping: false })
          : "",
        sourceName: line.sourceId ? sourceName(line.sourceId, books.sources) : "",
        memo: entry.memo,
        postedBy: entry.postedBy,
        reverses: entry.reversesEntryId
          ? books.journalEntries.find((item) => item.id === entry.reversesEntryId)?.reference ?? entry.reversesEntryId
          : "",
      })),
    );
    return csv(journalCsv(rows), "journal.csv");
  }

  if (kind === "reconciliation") {
    const rows = scoped.reconciliations.map((record) => ({
      status: record.status,
      sourceName: sourceName(record.sourceId, books.sources),
      externalId: record.sourceTransactionId
        ? books.sourceTransactions.find((transaction) => transaction.id === record.sourceTransactionId)?.externalId ?? ""
        : "",
      journalReference: record.journalEntryId
        ? `${books.journalEntries.find((entry) => entry.id === record.journalEntryId)?.reference ?? record.journalEntryId}:${record.journalLineNumber ?? ""}`
        : "",
      assetCode: record.assetCode,
      direction: record.direction,
      quantity: formatMinor(record.quantityMinor, books.assets.find((asset) => asset.code === record.assetCode)?.decimals ?? 0, {
        grouping: false,
      }),
      note: record.note,
    }));
    return csv(reconciliationCsv(rows), "reconciliation.csv");
  }

  if (kind === "pdf") {
    if (!entity) return new Response("No company.", { status: 404 });
    const report = entityReport({ books, entityId: entity.id, range: parsed.range, includeRevaluation: canRevalue(session) });
    const bytes = await reportPdf(
      entityReportDocument({ books, entityId: entity.id, range: parsed.range, report, generatedAt: new Date() }),
    );
    return pdf(bytes, `report-${slug(entity.name)}-${parsed.range.from}-${parsed.range.to}.pdf`);
  }

  return new Response("Unknown export kind.", { status: 400 });
}

async function individualExport(kind: IndividualReportKind, books: Books, range: DateRange, currencyParam: string | undefined) {
  const currency = individualCurrency(currencyParam, books.entities[0]?.functionalCurrency);
  const filename = individualReportFilename(kind, range);
  switch (kind) {
    case "portfolio":
      return csv(portfolioCsv(books, portfolioSummary(books, { asOf: range.to, currency })), filename);
    case "activity":
      return csv(activityCsv(books, activityHistory(books, range)), filename);
    case "value-over-time":
      return csv(valueOverTimeCsv(valueOverTime(books, { range, currency })), filename);
    case "pdf":
      return pdf(await reportPdf(individualReportDocument({ books, range, currency, generatedAt: new Date() })), filename);
  }
}

function csv(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function pdf(body: Uint8Array, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}
