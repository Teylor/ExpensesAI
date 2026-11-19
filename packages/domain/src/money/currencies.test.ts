import { describe, expect, it } from "vitest";
import {
  getCurrencyInfo,
  InvalidCurrencyError,
  normalizeCurrencyCode,
} from "./currencies.js";

describe("currencies metadata catalog", () => {
  it("normalizes and resolves known fiat currencies", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(getCurrencyInfo("EUR")).toEqual({
      code: "EUR",
      symbol: "€",
      decimals: 2,
      minDecimals: 2,
      maxDecimals: 2,
      kind: "fiat",
    });
    expect(getCurrencyInfo("usd")).toEqual({
      code: "USD",
      symbol: "$",
      decimals: 2,
      minDecimals: 2,
      maxDecimals: 2,
      kind: "fiat",
    });
    expect(getCurrencyInfo("JPY")).toEqual({
      code: "JPY",
      symbol: "¥",
      decimals: 0,
      minDecimals: 0,
      maxDecimals: 0,
      kind: "fiat",
    });
  });

  it("resolves known crypto assets with up to 8 decimals", () => {
    expect(getCurrencyInfo("BTC")).toEqual({
      code: "BTC",
      symbol: "BTC",
      decimals: 8,
      minDecimals: 0,
      maxDecimals: 8,
      kind: "crypto",
    });
    expect(getCurrencyInfo("eth").maxDecimals).toBe(8);
  });

  it("provides a safe generic fallback for valid unknown ISO/ticker codes", () => {
    expect(getCurrencyInfo("PLN")).toEqual({
      code: "PLN",
      symbol: "PLN",
      decimals: 2,
      minDecimals: 2,
      maxDecimals: 2,
      kind: "fiat",
    });
  });

  it("rejects malformed currency codes", () => {
    expect(() => normalizeCurrencyCode("")).toThrow(InvalidCurrencyError);
    expect(() => normalizeCurrencyCode("12")).toThrow(InvalidCurrencyError);
    expect(() => normalizeCurrencyCode("EU")).toThrow(InvalidCurrencyError);
    expect(() => normalizeCurrencyCode("TOOLONGCODE")).toThrow(
      InvalidCurrencyError,
    );
  });
});
