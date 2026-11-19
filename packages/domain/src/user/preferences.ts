import { z } from "zod";
import {
  currencyCodeSchema,
  decimalSeparatorSchema,
  symbolPositionSchema,
  thousandsSeparatorSchema,
} from "../money/schemas.js";
import { localeSchema, timeZoneSchema } from "../time/schemas.js";

const userPreferencesBaseSchema = z.object({
  baseCurrency: currencyCodeSchema,
  timezone: timeZoneSchema,
  locale: localeSchema,
  thousandsSeparator: thousandsSeparatorSchema,
  decimalSeparator: decimalSeparatorSchema,
  symbolPosition: symbolPositionSchema,
  agentConfirmEnabled: z.boolean(),
});

export const userPreferencesSchema = userPreferencesBaseSchema.superRefine(
  (data, ctx) => {
    if (
      data.thousandsSeparator !== "" &&
      data.thousandsSeparator === data.decimalSeparator
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["decimalSeparator"],
        message: "thousandsSeparator and decimalSeparator must be different",
      });
    }
  },
);

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updateUserPreferencesSchema = userPreferencesBaseSchema.partial();
export type UpdateUserPreferencesInput = z.infer<
  typeof updateUserPreferencesSchema
>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  baseCurrency: "EUR",
  timezone: "Europe/Madrid",
  locale: "es",
  thousandsSeparator: ".",
  decimalSeparator: ",",
  symbolPosition: "after",
  agentConfirmEnabled: true,
};

export function mergeUserPreferences(
  current: UserPreferences,
  patch: UpdateUserPreferencesInput,
): UserPreferences {
  const cleanPatch = updateUserPreferencesSchema.parse(patch);
  const definedPatch: Partial<UserPreferences> = {};
  for (const [key, value] of Object.entries(cleanPatch)) {
    if (value !== undefined) {
      (definedPatch as Record<string, unknown>)[key] = value;
    }
  }
  return userPreferencesSchema.parse({
    ...current,
    ...definedPatch,
  });
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const registerPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .max(128, "Password must be at most 128 characters long");

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: registerPasswordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
