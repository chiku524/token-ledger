import { describe, expect, it } from "vitest";
import { AuthError } from "@/auth/current";
import { BooksWriteError } from "@/db/write";
import { LedgerError } from "@/ledger";
import { safeMessage } from "./form-state";

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
