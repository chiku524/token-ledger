import { connectionFromForm, type ConnectionDraft } from "./connections";
import { connectionFormSchema, firstIssue, passwordFormSchema } from "./validate";
import { z } from "zod";

const nameText = z.string().trim().min(1, "Enter a name.").max(200);

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

  const company = signupCompanySchema.safeParse({
    organizationName: formData.get("organizationName"),
    entityName: formData.get("entityName"),
    jurisdiction: String(formData.get("jurisdiction") ?? "").toUpperCase(),
    functionalCurrency: formData.get("functionalCurrency"),
    reportingFramework: formData.get("reportingFramework") || "IFRS",
  });
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
    });
    if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
    connections.push(connectionFromForm(parsed.data));
  }

  return { ok: true, value: { account: account.data, company: company.data, connections } };
}

export function assignSignupEntity(drafts: readonly ConnectionDraft[], entityId: string): ConnectionDraft[] {
  return drafts.map((draft) => ({
    connection: { ...draft.connection, entityId },
    source: { ...draft.source, entityId },
  }));
}
