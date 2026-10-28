import { describe, expect, it } from "vitest";
import { descriptionText, isLongDescription } from "./info-hint-text";

describe("descriptionText", () => {
  it("reads strings and small pieces of markup", () => {
    expect(descriptionText("By account")).toBe("By account");
    expect(descriptionText(<>Use the <b>Import</b> form.</>)).toBe("Use the Import form.");
    expect(descriptionText(null)).toBe("");
    expect(descriptionText(false)).toBe("");
  });
});

describe("isLongDescription", () => {
  it("keeps a short one-line subtitle where it is", () => {
    expect(isLongDescription("By account")).toBe(false);
    expect(isLongDescription("What the books say each wallet holds.")).toBe(false);
    expect(isLongDescription("")).toBe(false);
    expect(isLongDescription(undefined)).toBe(false);
  });

  it("moves a description over about 90 characters into a hint", () => {
    expect(isLongDescription("x".repeat(90))).toBe(false);
    expect(isLongDescription("x".repeat(91))).toBe(true);
  });

  it("moves a multi-sentence description into a hint, even a short one", () => {
    expect(isLongDescription("Read only. No posting.")).toBe(true);
    expect(isLongDescription("Version 1.2 of the report")).toBe(false);
  });

  it("measures the words, not the markup", () => {
    expect(isLongDescription(<span className={"x".repeat(200)}>Short</span>)).toBe(false);
  });
});