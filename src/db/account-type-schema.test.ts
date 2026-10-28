import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ORGANIZATION_ACCOUNT_TYPES } from "@/data/account-type";
import { organizationAccountType, organizations } from "./schema";

describe("organizations.account_type", () => {
  const column = getTableColumns(organizations).accountType;

  it("is a required column that defaults to organization, so existing rows keep their meaning", () => {
    expect(column.name).toBe("account_type");
    expect(column.notNull).toBe(true);
    expect(column.hasDefault).toBe(true);
    expect(column.default).toBe("organization");
  });

  it("allows exactly the account types the app knows", () => {
    expect(organizationAccountType.enumValues).toEqual([...ORGANIZATION_ACCOUNT_TYPES]);
    expect(organizationAccountType.enumName).toBe("organization_account_type");
  });

  it("is added by a migration that backfills nothing and rewrites no rows", () => {
    const dir = join(process.cwd(), "drizzle");
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
    const sql = files
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .find((text) => text.includes('ADD COLUMN "account_type"'));
    expect(sql).toBeDefined();
    expect(sql).toContain('CREATE TYPE "public"."organization_account_type" AS ENUM(\'organization\', \'individual\')');
    expect(sql).toContain(
      'ALTER TABLE "organizations" ADD COLUMN "account_type" "organization_account_type" DEFAULT \'organization\' NOT NULL',
    );
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/i);
  });
});
