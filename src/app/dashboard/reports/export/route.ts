import { getSession } from "@/auth/current";
import { can, canAccessEntity } from "@/auth/roles";
import { formatMinor, journalCsv, netBalanceMinor, reconciliationCsv, trialBalance, trialBalanceCsv } from "@/ledger";
import { loadBooks } from "@/data/load-books";
import { parseDateRange } from "@/data/period";
import { scopeBooks } from "@/data/scope-books";
import { sliceBooks } from "@/data/slice-books";
import { accountLabel, entityName, sourceName } from "@/data/present";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "books.export")) {
    return new Response("Sign in to export.", { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const books = scopeBooks(await loadBooks(), session);
  const requestedEntity = url.searchParams.get("entity");
  if (requestedEntity && !canAccessEntity(session, requestedEntity)) {
    return new Response("That company is outside your access.", { status: 403 });
  }
  const parsed = parseDateRange(
    { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined },
    { from: books.period.start, to: books.period.end },
  );
  if (!parsed.ok) return new Response(parsed.message, { status: 400 });
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

  return new Response("Unknown export kind.", { status: 400 });
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
