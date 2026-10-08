import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/auth/current";
import { BooksWriteError } from "@/db/write";
import { LedgerError } from "@/ledger";
import { redirectOf, revalidatePath } from "@/test/server-harness";
import { fail, finish, safeMessage, save, withNotice } from "./form-state";

vi.mock("next/navigation", async () => (await import("@/test/server-harness")).navigationMock);
vi.mock("next/cache", async () => (await import("@/test/server-harness")).cacheMock);

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("safeMessage", () => {
  it("keeps known write and auth errors", () => {
    expect(safeMessage(new BooksWriteError("Choose a company."))).toBe("Choose a company.");
    expect(safeMessage(new AuthError("Sign in again."))).toBe("Sign in again.");
    expect(safeMessage(new LedgerError("UNBALANCED", "Unbalanced."))).toBe("Unbalanced.");
  });

  it("maps a missing connector encryption key", () => {
    expect(safeMessage(new Error("CONNECTOR_ENCRYPTION_KEY must be at least 32 characters."))).toBe(
      "Connector encryption is not configured on the server (CONNECTOR_ENCRYPTION_KEY). Ask an admin to set it, then try again.",
    );
  });

  it("maps a missing relation and unique violations", () => {
    expect(safeMessage({ code: "42P01" })).toBe("The database is missing a required table. Run migrations, then try again.");
    expect(safeMessage({ code: "23505" })).toBe("That reference or address is already in use.");
    expect(safeMessage({ cause: { code: "23505" } })).toBe("That reference or address is already in use.");
  });

  it("hides unknown errors behind a generic message", () => {
    expect(safeMessage(new Error("ECONNRESET from postgres"))).toBe("Could not save the record.");
  });
});

describe("withNotice", () => {
  it("attaches an encoded notice", () => {
    expect(withNotice("/dashboard/ledger", "saved", "Posted & saved.")).toBe("/dashboard/ledger?saved=Posted+%26+saved.");
  });

  it("keeps an existing query, such as a setup step", () => {
    expect(withNotice("/dashboard/setup?step=wallet", "error", "Name the wallet.")).toBe("/dashboard/setup?step=wallet&error=Name+the+wallet.");
  });

  it("replaces a stale notice of the same kind", () => {
    expect(withNotice("/dashboard/ledger?error=old", "error", "new")).toBe("/dashboard/ledger?error=new");
  });
});

describe("fail and finish", () => {
  it("fail redirects with an error and does not revalidate", async () => {
    const result = await redirectOf(Promise.resolve().then(() => fail("/dashboard/ledger", "No.")));
    expect(result.url).toBe("/dashboard/ledger?error=No.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("finish revalidates the dashboard layout, then redirects with a notice", async () => {
    const result = await redirectOf(Promise.resolve().then(() => finish("/dashboard/ledger", "Done.")));
    expect(result.url).toBe("/dashboard/ledger?saved=Done.");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });
});

describe("save", () => {
  it("runs the work and returns when it succeeds", async () => {
    const work = vi.fn(async () => "row");
    await expect(save("/dashboard/ledger", work)).resolves.toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("turns a known error into an error notice", async () => {
    const result = await redirectOf(save("/dashboard/ledger", async () => {
      throw new BooksWriteError("Reference is taken.");
    }));
    expect(result.url).toBe("/dashboard/ledger?error=Reference+is+taken.");
  });

  it("hides an unknown error and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await redirectOf(save("/dashboard/ledger", async () => {
      throw new Error("password=hunter2");
    }));
    expect(result.params.get("error")).toBe("Could not save the record.");
    expect(log).toHaveBeenCalledWith("books.save_failed", "password=hunter2");
  });
});
