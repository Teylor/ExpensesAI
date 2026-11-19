import { z } from "zod";
import { SUPPORTED_LOCALES } from "../contracts.js";
import { FINANCIAL_PERIODS } from "./periods.js";
import { isValidTimeZone, parseLocalDateParts } from "./timezone.js";

export const timeZoneSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => isValidTimeZone(value), {
    message: "Invalid IANA timezone identifier",
  });

export const localDateSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => {
      try {
        parseLocalDateParts(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid calendar date (expected real YYYY-MM-DD)" },
  );

export const financialPeriodSchema = z.enum(FINANCIAL_PERIODS);
export const localeSchema = z.enum(SUPPORTED_LOCALES);
