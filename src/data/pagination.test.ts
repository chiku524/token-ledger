import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageHref, paginate, parsePage } from "./pagination";

describe("parsePage", () => {
  it("defaults to 1 for absent or malformed values", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("2.5")).toBe(2);
  });

  it("reads a positive integer and takes the first of an array", () => {
    expect(parsePage("7")).toBe(7);
    expect(parsePage(["4", "9"])).toBe(4);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 137 }, (_, index) => index + 1);

  it("returns the first page and its window bounds", () => {
    const page = paginate(rows, 1);
    expect(page.items).toHaveLength(PAGE_SIZE);
    expect(page.items[0]).toBe(1);
    expect(page.items.at(-1)).toBe(PAGE_SIZE);
    expect(page).toMatchObject({ page: 1, pageCount: 3, total: 137, from: 1, to: 50 });
  });

  it("returns a middle page and the final partial page", () => {
    expect(paginate(rows, 2)).toMatchObject({ page: 2, pageCount: 3, from: 51, to: 100 });
    const last = paginate(rows, 3);
    expect(last.items).toHaveLength(37);
    expect(last).toMatchObject({ page: 3, from: 101, to: 137 });
  });

  it("clamps a page beyond the end to the last page", () => {
    expect(paginate(rows, 99)).toMatchObject({ page: 3, from: 101, to: 137 });
  });

  it("clamps a page below the start to the first page", () => {
    expect(paginate(rows, 0)).toMatchObject({ page: 1, from: 1, to: 50 });
    expect(paginate(rows, -5)).toMatchObject({ page: 1 });
  });

  it("reports one empty page for an empty collection", () => {
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
  });

  it("honours a custom page size", () => {
    const page = paginate(rows, 2, 10);
    expect(page.items).toHaveLength(10);
    expect(page).toMatchObject({ page: 2, pageCount: 14, from: 11, to: 20 });
  });
});

describe("pageHref", () => {
  it("omits page 1 and keeps the query", () => {
    expect(pageHref("/dashboard/audit", { actor: "Amina" }, 1)).toBe("/dashboard/audit?actor=Amina");
  });

  it("adds page and preserves the query", () => {
    expect(pageHref("/dashboard/audit", { actor: "Amina", from: "2026-01-01" }, 2)).toBe(
      "/dashboard/audit?actor=Amina&from=2026-01-01&page=2",
    );
  });

  it("drops empty query values and returns the bare path when nothing remains", () => {
    expect(pageHref("/dashboard/ledger", { from: "", to: "" }, 1)).toBe("/dashboard/ledger");
  });
});
