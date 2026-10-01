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

const watchVenue = z.enum(["ethereum", "solana", "polygon"]);
const exchangeVenue = z.enum(["kraken", "exchange"]);

export const connectionFormSchema = z
  .object({
    entityId: text(80),
    mode: z.enum(["watch", "exchange_read", "custodian_read"]),
    name: text(200),
    chain: optionalText(40),
    role: z.enum(["hot", "cold", "staking", ""]).optional().transform((value) => (value ? value : null)),
    identifier: text(200),
    exchangeVenue: z
      .union([exchangeVenue, z.literal("")])
      .optional()
      .transform((value) => (value ? value : null)),
    apiKey: z.string().trim().max(200).optional().transform((value) => (value ? value : null)),
    apiSecret: z.string().trim().max(400).optional().transform((value) => (value ? value : null)),
  })
  .superRefine((value, context) => {
    if (value.mode === "watch" && !value.role) {
      context.addIssue({ code: "custom", path: ["role"], message: "A wallet needs a type: hot wallet, cold wallet, or staking." });
    }
    if (value.mode !== "watch" && value.role) {
      context.addIssue({ code: "custom", path: ["role"], message: "Only a watch-only wallet has a hot, cold, or staking type." });
    }
    if (value.mode === "watch" && !watchVenue.safeParse(value.chain).success) {
      context.addIssue({ code: "custom", path: ["chain"], message: "Choose Ethereum, Solana, or Polygon." });
    }
    if (value.mode === "custodian_read" && value.chain && !watchVenue.safeParse(value.chain).success) {
      context.addIssue({ code: "custom", path: ["chain"], message: "Choose Ethereum, Solana, or Polygon, or leave the network blank." });
    }
    if (value.mode === "exchange_read") {
      if (!value.exchangeVenue) {
        context.addIssue({ code: "custom", path: ["exchangeVenue"], message: "Choose an exchange." });
      }
      const hasKey = Boolean(value.apiKey);
      const hasSecret = Boolean(value.apiSecret);
      if (hasKey !== hasSecret) {
        context.addIssue({ code: "custom", path: ["apiKey"], message: "Enter both the API key and the API secret, or neither." });
      }
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
  lines: z.array(journalLineSchema).min(2, "An entry needs at least two lines.").max(8),
});

export const reversalFormSchema = z.object({
  entryId: text(80),
  reference: text(40),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  memo: text(500),
});

export const fxRateFormSchema = z.object({
  baseCurrency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
  quoteCurrency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
  rate: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Rate can have at most 4 decimal places."),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  note: text(300),
}).superRefine((value, context) => {
  if (value.baseCurrency === value.quoteCurrency) {
    context.addIssue({ code: "custom", path: ["quoteCurrency"], message: "The two currencies must differ." });
  }
  if (value.rate === "0" || value.rate === "0.0" || value.rate === "0.00" || value.rate === "0.000" || value.rate === "0.0000") {
    context.addIssue({ code: "custom", path: ["rate"], message: "The rate must be positive." });
  }
});

export const userFormSchema = z.object({
  name: text(80),
  email: z.string().trim().email("Enter an email address.").max(200),
  role: z.enum(["owner", "admin", "accountant", "viewer"]),
  entityScope: z.string().trim().max(500).optional().transform((value) => (value ? value.split(",").map((id) => id.trim()).filter(Boolean) : [])),
});

export const passwordFormSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters.").max(200),
  confirm: z.string(),
}).superRefine((value, context) => {
  if (value.password !== value.confirm) {
    context.addIssue({ code: "custom", path: ["confirm"], message: "The passwords do not match." });
  }
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
