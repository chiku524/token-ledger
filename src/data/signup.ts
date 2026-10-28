import {
  DEFAULT_ORGANIZATION_ACCOUNT_TYPE,
  INDIVIDUAL_DEFAULTS,
  ORGANIZATION_ACCOUNT_TYPES,
  personalBooksName,
  type OrganizationAccountType,
} from "./account-type";
import { connectionFromForm, type ConnectionDraft } from "./connections";
import { connectionFormSchema, firstIssue, passwordFormSchema } from "./validate";
import { z } from "zod";

const nameText = z.string().trim().min(1, "Enter a name.").max(200);

export const signupAccountTypeSchema = z.enum(ORGANIZATION_ACCOUNT_TYPES, {
  message: "Choose whether this account is for an individual or an organization.",
});

export const signupAccountSchema = z
  .object({
    name: nameText.max(80),
    email: z.string().trim().email("Enter an email address.").max(200),
  })
  .and(passwordFormSchema);

export const signupCompanySchema = z.object({
  organizationName: nameText,
  entityName: nameText,
  jurisdiction: z.string().trim().regex(/^[A-Z]{2}$/, "Country code must be two letters, such as MY or SG."),
  functionalCurrency: z.enum(["MYR", "SGD", "USD"]),
  reportingFramework: nameText.max(40),
});

export interface SignupConnectionFields {
  enabled: boolean;
  name: string;
  chain: string;
  role: string;
  identifier: string;
}

export interface ParsedSignup {
  accountType: OrganizationAccountType;
  account: z.infer<typeof signupAccountSchema>;
  company: z.infer<typeof signupCompanySchema>;
  connections: ConnectionDraft[];
}

const PLACEHOLDER_ENTITY = "ent_signup";

export function parseSignup(formData: FormData): { ok: true; value: ParsedSignup } | { ok: false; message: string } {
  const account = signupAccountSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!account.success) return { ok: false, message: firstIssue(account.error) };

  // A form that does not say (an older page, a script) is an organization, as before.
  const accountType = signupAccountTypeSchema.safeParse(formData.get("accountType") || DEFAULT_ORGANIZATION_ACCOUNT_TYPE);
  if (!accountType.success) return { ok: false, message: firstIssue(accountType.error) };
  const individual = accountType.data === "individual";

  // An individual skips the Company step: the books are named after the person,
  // and country and currency fall back to defaults when left blank.
  const company = signupCompanySchema.safeParse(
    individual
      ? {
          organizationName: personalBooksName(account.data.name),
          entityName: personalBooksName(account.data.name),
          jurisdiction: String(formData.get("jurisdiction") || INDIVIDUAL_DEFAULTS.jurisdiction).toUpperCase(),
          functionalCurrency: formData.get("functionalCurrency") || INDIVIDUAL_DEFAULTS.functionalCurrency,
          reportingFramework: INDIVIDUAL_DEFAULTS.reportingFramework,
        }
      : {
          organizationName: formData.get("organizationName"),
          entityName: formData.get("entityName"),
          jurisdiction: String(formData.get("jurisdiction") ?? "").toUpperCase(),
          functionalCurrency: formData.get("functionalCurrency"),
          reportingFramework: formData.get("reportingFramework") || "IFRS",
        },
  );
  if (!company.success) return { ok: false, message: firstIssue(company.error) };

  const connections: ConnectionDraft[] = [];
  for (const mode of ["watch", "exchange_read", "custodian_read"] as const) {
    const prefix = mode === "watch" ? "wallet" : mode === "exchange_read" ? "exchange" : "custodian";
    if (formData.get(`${prefix}Enabled`) !== "on") continue;
    const parsed = connectionFormSchema.safeParse({
      entityId: PLACEHOLDER_ENTITY,
      mode,
      name: formData.get(`${prefix}Name`),
      chain: formData.get(`${prefix}Chain`) ?? "",
      role: formData.get(`${prefix}Role`) ?? "",
      identifier: formData.get(`${prefix}Identifier`),
      // A signup connection records the venue only; the user adds a read-only
      // credential later. It stays pending until they do.
      exchangeVenue: mode === "exchange_read" ? formData.get("exchangeVenue") ?? "kraken" : "",
      custodianVenue: mode === "custodian_read" ? formData.get("custodianVenue") ?? "fireblocks" : "",
    });
    if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
    connections.push(connectionFromForm(parsed.data));
  }

  return { ok: true, value: { accountType: accountType.data, account: account.data, company: company.data, connections } };
}

export function assignSignupEntity(drafts: readonly ConnectionDraft[], entityId: string): ConnectionDraft[] {
  return drafts.map((draft) => ({
    connection: { ...draft.connection, entityId },
    source: { ...draft.source, entityId },
  }));
}
