import { describe, expect, it } from "vitest";
import {
  financialPeriodSchema,
  localDateSchema,
  localeSchema,
  timeZoneSchema,
} from "./schemas.js";

describe("shared Zod schemas for timezone, localDate, periods, and locale", () => {
  it("validates IANA timezones and trims whitespace", () => {
    expect(timeZoneSchema.parse(" Europe/Madrid ")).toBe("Europe/Madrid");
    expect(timeZoneSchema.parse("UTC")).toBe("UTC");
    expect(() => timeZoneSchema.parse("Mars/Olympus")).toThrow();
    expect(() => timeZoneSchema.parse("")).toThrow();
  });

  it("validates real YYYY-MM-DD calendar dates and rejects impossible ones", () => {
    expect(localDateSchema.parse("2026-11-19")).toBe("2026-11-19");
    expect(localDateSchema.parse("2024-02-29")).toBe("2024-02-29");
    expect(() => localDateSchema.parse("2026-02-29")).toThrow();
    expect(() => localDateSchema.parse("2026-02-30")).toThrow();
    expect(() => localDateSchema.parse("19/11/2026")).toThrow();
  });

  it("validates financial periods and supported locales", () => {
    expect(financialPeriodSchema.parse("monthly")).toBe("monthly");
    expect(financialPeriodSchema.parse("quarterly")).toBe("quarterly");
    expect(() => financialPeriodSchema.parse("biweekly")).toThrow();

    expect(localeSchema.parse("es")).toBe("es");
    expect(localeSchema.parse("en")).toBe("en");
    expect(() => localeSchema.parse("fr")).toThrow();
  });
});
