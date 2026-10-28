import { isValidElement, type ReactNode } from "react";

/** A description longer than this many characters moves into an info hint. */
export const LONG_DESCRIPTION_CHARS = 90;

/** The words in a description, whether it is a string or a small piece of markup. */
export function descriptionText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(descriptionText).join("");
  if (isValidElement(node)) return descriptionText((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * Whether a description is more than one short sentence: over about 90
 * characters, or more than one sentence. Those move into an info hint next to
 * the section title. Short one-line subtitles stay where they are.
 */
export function isLongDescription(node: ReactNode): boolean {
  const text = descriptionText(node).replace(/\s+/g, " ").trim();
  if (text.length === 0) return false;
  if (text.length > LONG_DESCRIPTION_CHARS) return true;
  return /[.!?]["')\]]?\s+\S/.test(text);
}