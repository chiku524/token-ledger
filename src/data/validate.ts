import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const entityFormSchema = z.object({
  name: text(200),
  jurisdiction: z.string().trim().regex(/^[A-Z]{2}$/, "Country code must be two letters, such as MY or SG."),
  functionalCurrency: z.enum(["MYR", "SGD", "USD"]),
  reportingFramework: text(40),
  parentEntityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
});

export const sourceFormSchema = z
  .object({
    entityId: text(80),
    kind: z.enum(["wallet", "exchange", "custodian"]),
    role: z.enum(["hot", "cold", "staking", ""]).optional().transform((value) => (value ? value : null)),
    name: text(200),
    chain: optionalText(40),
    identifier: text(200),
  })
  .superRefine((value, context) => {
    if (value.kind === "wallet" && !value.role) {
      context.addIssue({ code: "custom", path: ["role"], message: "A wallet needs a type: hot wallet, cold wallet, or staking." });
    }
    if (value.kind !== "wallet" && value.role) {
      context.addIssue({ code: "custom", path: ["role"], message: "Only wallets have a hot, cold, or staking type." });
    }
  });

export const journalLineSchema = z.object({
  accountCode: text(20),
  side: z.enum(["debit", "credit"]),
  amount: z.string().trim().min(1),
  assetCode: z.string().trim().optional().transform((value) => value || undefined),
  quantity: z.string().trim().optional().transform((value) => value || undefined),
  quantityDirection: z.enum(["in", "out", ""]).optional().transform((value) => (value ? value : undefined)),
  sourceId: z.string().trim().optional().transform((value) => value || undefined),
});

export const journalFormSchema = z.object({
  entityId: text(80),
  reference: text(40),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  memo: text(500),
  postedBy: text(80),
  lines: z.array(journalLineSchema).min(2, "An entry needs at least two lines.").max(8),
});

export const reversalFormSchema = z.object({
  entryId: text(80),
  reference: text(40),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  memo: text(500),
  postedBy: text(80),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
