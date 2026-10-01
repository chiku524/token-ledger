/**
 * Which observed rows an organization can record. A source may return a token
 * the organization has no asset row for; that row is skipped rather than
 * failing the whole pull. Kept pure so the rule is tested without a database.
 */
export interface CodedRow {
  assetCode: string;
}

export interface SplitKnownAssets<T extends CodedRow> {
  known: T[];
  /** Distinct asset codes that were skipped, in first-seen order. */
  skipped: string[];
}

export function splitKnownAssets<T extends CodedRow>(rows: readonly T[], known: ReadonlySet<string>): SplitKnownAssets<T> {
  const kept: T[] = [];
  const skipped: string[] = [];
  const seenSkipped = new Set<string>();
  for (const row of rows) {
    if (known.has(row.assetCode)) {
      kept.push(row);
    } else if (!seenSkipped.has(row.assetCode)) {
      seenSkipped.add(row.assetCode);
      skipped.push(row.assetCode);
    }
  }
  return { known: kept, skipped };
}
