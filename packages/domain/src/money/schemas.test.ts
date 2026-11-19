import { describe, expect, it } from "vitest";
import {
  currencyCodeSchema,
  decimalStringSchema,
  moneySchema,
  numberFormatPreferencesSchema,
  positiveDecimalStringSchema,
} from "./schemas.js";

describe("shared Zod schemas for money and formatting preferences", () => {
  it("normalizes valid currency codes and rejects invalid ones", () => {
    expect(currencyCodeSchema.parse(" eur ")).toBe("EUR");
    expect(currencyCodeSchema.parse("btc")).toBe("BTC");
    expect(() => currencyCodeSchema.parse("12")).toThrow();
    expect(() => currencyCodeSchema.parse("TOOLONG")).toThrow();
  });

  it("validates canonical decimal strings and rejects numbers or ambiguous commas", () => {
    expect(decimalStringSchema.parse("2000.50")).toBe("2000.50");
    expect(decimalStringSchema.parse("-0.00000001")).toBe("-0.00000001");
    expect(() => decimalStringSchema.parse(100)).toThrow();
    expect(() => decimalStringSchema.parse("12,34")).toThrow();
    expect(() => decimalStringSchema.parse("NaN")).toThrow();
  });

  it("enforces strictly positive decimals for FX rates and amounts", () => {
    expect(positiveDecimalStringSchema.parse("0.90966")).toBe("0.90966");
    expect(() => positiveDecimalStringSchema.parse("0")).toThrow();
    expect(() => positiveDecimalStringSchema.parse("-1.5")).toThrow();
  });

  it("validates Money objects", () => {
    expect(moneySchema.parse({ amount: "1819.32", currency: "eur" })).toEqual({
      amount: "1819.32",
      currency: "EUR",
    });
  });

  it("validates NumberFormatPreferences and rejects identical thousands and decimal separators", () => {
    expect(
      numberFormatPreferencesSchema.parse({
        thousandsSeparator: ".",
        decimalSeparator: ",",
      }),
    ).toEqual({
      thousandsSeparator: ".",
      decimalSeparator: ",",
      symbolPosition: "after",
    });

    expect(() =>
      numberFormatPreferencesSchema.parse({
        thousandsSeparator: ".",
        decimalSeparator: ".",
      }),
    ).toThrow(/different/i);

    expect(() =>
      numberFormatPreferencesSchema.parse({
        thousandsSeparator: ",",
        decimalSeparator: ",",
      }),
    ).toThrow(/different/i);
  });
});
