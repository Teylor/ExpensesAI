import { describe, expect, it } from "vitest";
import {
  addMoney,
  CurrencyMismatchError,
  compareMoney,
  convertMoney,
  createMoney,
  InvalidAmountError,
  InvalidFxRateError,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  negateMoney,
  subtractMoney,
  sumMoney,
  toDbNumericString,
} from "./money.js";

describe("exact money arithmetic with decimal.js", () => {
  it("eliminates binary floating-point drift on 0.1 + 0.2", () => {
    const a = createMoney("0.1", "EUR");
    const b = createMoney("0.2", "EUR");
    const total = addMoney(a, b);

    expect(total.amount).toBe("0.3");
    expect(total.currency).toBe("EUR");
  });

  it("supports subtraction, negation, comparison, signs, and summation", () => {
    const income = createMoney("2400.50", "EUR");
    const rent = createMoney("950.25", "EUR");
    const remaining = subtractMoney(income, rent);

    expect(remaining.amount).toBe("1450.25");
    expect(negateMoney(rent).amount).toBe("-950.25");
    expect(compareMoney(income, rent)).toBe(1);
    expect(compareMoney(rent, income)).toBe(-1);
    expect(compareMoney(rent, createMoney("950.2500", "EUR"))).toBe(0);

    expect(isPositiveMoney(remaining)).toBe(true);
    expect(isNegativeMoney(negateMoney(rent))).toBe(true);
    expect(isZeroMoney(createMoney("-0.00", "EUR"))).toBe(true);

    const summed = sumMoney(
      [
        createMoney("10.10", "EUR"),
        createMoney("20.20", "EUR"),
        createMoney("-5.05", "EUR"),
      ],
      "EUR",
    );
    expect(summed.amount).toBe("25.25");
    expect(sumMoney([], "USD")).toEqual({ amount: "0", currency: "USD" });
  });

  it("throws CurrencyMismatchError when combining different currencies without conversion", () => {
    const eur = createMoney("100", "EUR");
    const usd = createMoney("100", "USD");

    expect(() => addMoney(eur, usd)).toThrow(CurrencyMismatchError);
    expect(() => subtractMoney(eur, usd)).toThrow(CurrencyMismatchError);
    expect(() => compareMoney(eur, usd)).toThrow(CurrencyMismatchError);
    expect(() => sumMoney([eur, usd], "EUR")).toThrow(CurrencyMismatchError);
  });

  it("rejects invalid non-canonical amount strings", () => {
    expect(() => createMoney("", "EUR")).toThrow(InvalidAmountError);
    expect(() => createMoney("abc", "EUR")).toThrow(InvalidAmountError);
    expect(() => createMoney("NaN", "EUR")).toThrow(InvalidAmountError);
    expect(() => createMoney("Infinity", "EUR")).toThrow(InvalidAmountError);
    expect(() => createMoney("12,34", "EUR")).toThrow(InvalidAmountError);
  });

  it("serializes exact PostgreSQL numeric(20, 8) strings without scientific notation", () => {
    expect(toDbNumericString(createMoney("0.00000001", "BTC"))).toBe(
      "0.00000001",
    );
    expect(toDbNumericString(createMoney("1819.32", "EUR"))).toBe(
      "1819.32000000",
    );
    expect(toDbNumericString(createMoney("1.000000005", "BTC"))).toBe(
      "1.00000001",
    );
  });
});

describe("convertMoney (exact multicurrency conversion)", () => {
  it("converts USD to EUR with exact decimal precision", () => {
    const usd = createMoney("2000", "USD");
    const eur = convertMoney(usd, "EUR", "0.90966");

    expect(eur).toEqual({ amount: "1819.32", currency: "EUR" });
  });

  it("returns unchanged amount when source and target currencies match", () => {
    const eur = createMoney("123.456789", "EUR");
    expect(convertMoney(eur, "eur", "1")).toEqual({
      amount: "123.456789",
      currency: "EUR",
    });
  });

  it("handles negative amounts and preserves up to 8 decimal places", () => {
    const debt = createMoney("-100", "USD");
    const converted = convertMoney(debt, "EUR", "0.9123456789");

    expect(converted.currency).toBe("EUR");
    expect(converted.amount).toBe("-91.23456789");
  });

  it("rejects zero, negative, or non-numeric FX rates", () => {
    const usd = createMoney("100", "USD");

    expect(() => convertMoney(usd, "EUR", "0")).toThrow(InvalidFxRateError);
    expect(() => convertMoney(usd, "EUR", "-0.9")).toThrow(InvalidFxRateError);
    expect(() => convertMoney(usd, "EUR", "not-a-rate")).toThrow(
      InvalidFxRateError,
    );
  });
});
