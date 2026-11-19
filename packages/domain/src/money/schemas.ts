import { z } from "zod";
import { CURRENCY_CODE_PATTERN } from "./currencies.js";
import { CANONICAL_DECIMAL_PATTERN, parseDecimal } from "./money.js";

export const currencyCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => CURRENCY_CODE_PATTERN.test(value), {
    message:
      "Currency code must be 3 to 6 uppercase letters (e.g. EUR, USD, BTC)",
  });

export const decimalStringSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => CANONICAL_DECIMAL_PATTERN.test(value), {
    message:
      "Amount must be a canonical decimal string using '.' as decimal separator",
  })
  .refine(
    (value) => {
      try {
        parseDecimal(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Amount must be a finite decimal number" },
  );

export const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => parseDecimal(value).greaterThan(0),
  { message: "Value must be strictly greater than 0" },
);

export const moneySchema = z.object({
  amount: decimalStringSchema,
  currency: currencyCodeSchema,
});

export const thousandsSeparatorSchema = z.enum([".", ",", " ", ""]);
export const decimalSeparatorSchema = z.enum([",", "."]);
export const symbolPositionSchema = z.enum(["after", "before"]);

export const numberFormatPreferencesSchema = z
  .object({
    thousandsSeparator: thousandsSeparatorSchema,
    decimalSeparator: decimalSeparatorSchema,
    symbolPosition: symbolPositionSchema.default("after"),
  })
  .superRefine((data, ctx) => {
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
  });
