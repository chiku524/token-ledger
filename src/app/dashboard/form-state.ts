import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "@/auth/current";
import { BooksWriteError } from "@/db/write";
import { LedgerError } from "@/ledger";

export function finish(path: string, message: string): never {
  revalidatePath("/dashboard", "layout");
  redirect(`${path}?saved=${encodeURIComponent(message)}`);
}

export function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
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
