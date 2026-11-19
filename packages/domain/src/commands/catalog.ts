import { z } from "zod";
import { ACCOUNT_TYPES, TRANSACTION_SOURCES } from "../contracts.js";
import {
  currencyCodeSchema,
  decimalStringSchema,
  positiveDecimalStringSchema,
} from "../money/schemas.js";
import { financialPeriodSchema } from "../time/schemas.js";

export const COMMAND_ACTORS = ["manual", "agent", "system"] as const;
export type CommandActor = (typeof COMMAND_ACTORS)[number];

/** Ámbitos de categorías 100% editables por cada usuario (añadir, renombrar o eliminar presets). */
export const CATEGORY_SCOPES = [
  "income",
  "expense",
  "investment",
  "networth",
] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

/** Presets iniciales editables para tipos de inversión (el usuario puede añadir, editar o eliminar cualquiera). */
export const DEFAULT_INVESTMENT_ASSET_TYPES = [
  "crypto",
  "stocks",
  "etf",
  "funds",
] as const;

export const NET_WORTH_KINDS = ["asset", "liability"] as const;
export type NetWorthKind = (typeof NET_WORTH_KINDS)[number];

/** Presets iniciales editables para categorías de patrimonio (el usuario puede añadir, editar o eliminar cualquiera). */
export const DEFAULT_NET_WORTH_CATEGORIES = [
  "real_estate",
  "vehicle",
  "collectibles_cards",
  "mortgage",
  "loan",
] as const;

const editableCategoryNameSchema = z.string().trim().min(1).max(60);

const commandMetaFields = {
  commandId: z.uuid(),
  actor: z.enum(COMMAND_ACTORS),
  issuedAtUtc: z.iso.datetime(),
};

const accountCreatePayloadSchema = z.object({
  accountId: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  accountType: z.enum(ACCOUNT_TYPES),
  currency: currencyCodeSchema,
  initialBalance: decimalStringSchema.default("0"),
});

const accountUpdatePayloadSchema = z.object({
  accountId: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
});

const accountArchivePayloadSchema = z.object({
  accountId: z.uuid(),
});

const transactionRecordPayloadSchema = z.object({
  transactionId: z.uuid().optional(),
  kind: z.enum(["income", "expense"]),
  accountId: z.uuid(),
  amount: positiveDecimalStringSchema,
  currency: currencyCodeSchema,
  categoryId: z.uuid().optional(),
  description: z.string().trim().min(1).max(240),
  clientOrPayee: z.string().trim().min(1).max(120).optional(),
  occurredAtUtc: z.iso.datetime().optional(),
  fxRateToBaseOverride: positiveDecimalStringSchema.optional(),
  source: z.enum(TRANSACTION_SOURCES).default("manual"),
  externalId: z.string().trim().min(1).max(160).optional(),
});

const transactionTransferPayloadSchema = z
  .object({
    transactionId: z.uuid().optional(),
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    amount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    destinationAmount: positiveDecimalStringSchema.optional(),
    destinationCurrency: currencyCodeSchema.optional(),
    description: z.string().trim().min(1).max(240).optional(),
    occurredAtUtc: z.iso.datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fromAccountId === data.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "fromAccountId and toAccountId must be different",
      });
    }
  });

const transactionDeletePayloadSchema = z.object({
  transactionId: z.uuid(),
});

const recurringUpsertPayloadSchema = z.object({
  ruleId: z.uuid().optional(),
  kind: z.enum(["income", "expense"]),
  accountId: z.uuid(),
  amount: positiveDecimalStringSchema,
  currency: currencyCodeSchema,
  frequency: financialPeriodSchema,
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  categoryId: z.uuid().optional(),
  description: z.string().trim().min(1).max(240),
  isActive: z.boolean().default(true),
});

const recurringDeletePayloadSchema = z.object({
  ruleId: z.uuid(),
});

const investmentUpsertPayloadSchema = z.object({
  investmentId: z.uuid().optional(),
  assetType: editableCategoryNameSchema,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(20).optional(),
  quantity: positiveDecimalStringSchema.optional(),
  investedAmount: decimalStringSchema,
  currentValue: decimalStringSchema,
  currency: currencyCodeSchema,
});

const netWorthUpsertPayloadSchema = z.object({
  itemId: z.uuid().optional(),
  kind: z.enum(NET_WORTH_KINDS),
  category: editableCategoryNameSchema,
  name: z.string().trim().min(1).max(120),
  estimatedValue: positiveDecimalStringSchema,
  currency: currencyCodeSchema,
});

const categoryUpsertPayloadSchema = z.object({
  categoryId: z.uuid().optional(),
  scope: z.enum(CATEGORY_SCOPES),
  name: editableCategoryNameSchema,
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().min(1).max(32).optional(),
});

const categoryDeletePayloadSchema = z.object({
  categoryId: z.uuid(),
});

const commandUndoPayloadSchema = z.object({
  targetCommandId: z.uuid(),
});

export const commandEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    ...commandMetaFields,
    type: z.literal("account.create"),
    payload: accountCreatePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("account.update"),
    payload: accountUpdatePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("account.archive"),
    payload: accountArchivePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("transaction.record"),
    payload: transactionRecordPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("transaction.transfer"),
    payload: transactionTransferPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("transaction.delete"),
    payload: transactionDeletePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("recurring.upsert"),
    payload: recurringUpsertPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("recurring.delete"),
    payload: recurringDeletePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("investment.upsert"),
    payload: investmentUpsertPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("networth.upsert"),
    payload: netWorthUpsertPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("category.upsert"),
    payload: categoryUpsertPayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("category.delete"),
    payload: categoryDeletePayloadSchema,
  }),
  z.object({
    ...commandMetaFields,
    type: z.literal("command.undo"),
    payload: commandUndoPayloadSchema,
  }),
]);

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
export type CommandType = CommandEnvelope["type"];

export const commandBatchRequestSchema = z.object({
  commands: z.array(commandEnvelopeSchema).min(1).max(100),
});

export type CommandBatchRequest = z.infer<typeof commandBatchRequestSchema>;
