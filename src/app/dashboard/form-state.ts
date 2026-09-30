import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "@/auth/current";
import { BooksWriteError } from "@/db/write";
import { LedgerError } from "@/ledger";

export function finish(path: string, message: string): never {
  revalidatePath("/dashboard", "layout");
  redirect(withNotice(path, "saved", message));
}

export function fail(path: string, message: string): never {
  redirect(withNotice(path, "error", message));
}

/** Keep an existing query, such as a setup step, and attach the notice. */
export function withNotice(path: string, key: "saved" | "error", message: string): string {
  const split = path.indexOf("?");
  const pathname = split === -1 ? path : path.slice(0, split);
  const params = new URLSearchParams(split === -1 ? "" : path.slice(split + 1));
  params.set(key, message);
  return `${pathname}?${params.toString()}`;
}

export async function save(path: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    fail(path, safeMessage(error));
  }
}

export function safeMessage(error: unknown): string {
  if (error instanceof AuthError || error instanceof LedgerError || error instanceof BooksWriteError) return error.message;
  if (hasCode(error, "23505")) return "That reference or address is already in use.";
  return "Could not save the record.";
}

function hasCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  if ("cause" in error) return hasCode(error.cause, code);
  return false;
}
