import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JournalEntryDetail, JournalEntryList, type JournalEntryView } from "./journal-entry-list";

vi.mock("@/components/record-forms", () => ({
  ReverseJournalForm: ({ entry }: { entry: { reference: string } }) => (
    <div>Post correction for {entry.reference}</div>
  ),
}));

const sample: JournalEntryView = {
  id: "e1",
  reference: "JE-2026-001",
  entryDate: "2026-04-02",
  memo: "Share capital subscribed in cash.",
  company: "Harbourline Digital Sdn. Bhd.",
  postedBy: "example books",
  correctsReference: null,
  amountLabel: "Balanced MYR 500,000.00",
  canCorrect: true,
  lines: [
    {
      lineNumber: 1,
      account: "1000 Cash",
      source: null,
      quantity: "—",
      debit: "MYR 500,000.00",
      credit: "",
    },
    {
      lineNumber: 2,
      account: "3100 Owners' capital",
      source: null,
      quantity: "—",
      debit: "",
      credit: "MYR 500,000.00",
    },
  ],
};

describe("JournalEntryList", () => {
  it("renders a compact clickable card without lines or correction", () => {
    const html = renderToStaticMarkup(<JournalEntryList entries={[sample]} csrf="csrf" />);
    expect(html).toContain("JE-2026-001");
    expect(html).toContain("Harbourline Digital Sdn. Bhd.");
    expect(html).toContain("Balanced MYR 500,000.00");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("1000 Cash");
    expect(html).not.toContain("Post correction for JE-2026-001");
  });
});

describe("JournalEntryDetail", () => {
  it("shows the lines table and correction form for the open entry", () => {
    const html = renderToStaticMarkup(<JournalEntryDetail entry={sample} csrf="csrf" />);
    expect(html).toContain("JE-2026-001");
    expect(html).toContain("1000 Cash");
    expect(html).toContain("3100 Owners&#x27; capital");
    expect(html).toContain("MYR 500,000.00");
    expect(html).toContain("Post correction for JE-2026-001");
  });

  it("hides the correction form when the entry cannot be corrected", () => {
    const html = renderToStaticMarkup(
      <JournalEntryDetail entry={{ ...sample, canCorrect: false }} csrf="csrf" />,
    );
    expect(html).toContain("1000 Cash");
    expect(html).not.toContain("Post correction");
  });
});
