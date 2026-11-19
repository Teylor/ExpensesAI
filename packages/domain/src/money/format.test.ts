import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUMBER_FORMAT,
  formatMoney,
  formatMoneyWithBase,
  InvalidNumberFormatError,
  type NumberFormatPreferences,
} from "./format.js";
import { createMoney } from "./money.js";

const ES_FORMAT: NumberFormatPreferences = {
  thousandsSeparator: ".",
  decimalSeparator: ",",
  symbolPosition: "after",
};

const US_BEFORE_FORMAT: NumberFormatPreferences = {
  thousandsSeparator: ",",
  decimalSeparator: ".",
  symbolPosition: "before",
};

const US_AFTER_FORMAT: NumberFormatPreferences = {
  thousandsSeparator: ",",
  decimalSeparator: ".",
  symbolPosition: "after",
};

describe("formatMoney (configurable separators and currency precision)", () => {
  it("formats EUR and USD with dot thousands and comma decimals", () => {
    expect(formatMoney(createMoney("1819.32", "EUR"), ES_FORMAT)).toBe(
      "1.819,32 €",
    );
    expect(formatMoney(createMoney("2000", "USD"), ES_FORMAT)).toBe(
      "2.000,00 $",
    );
    expect(formatMoney(createMoney("1234567.89", "EUR"), ES_FORMAT)).toBe(
      "1.234.567,89 €",
    );
    expect(formatMoney(createMoney("-1250.5", "EUR"), ES_FORMAT)).toBe(
      "-1.250,50 €",
    );
    expect(formatMoney(createMoney("0", "EUR"), DEFAULT_NUMBER_FORMAT)).toBe(
      "0,00 €",
    );
  });

  it("avoids negative zero after rounding", () => {
    expect(formatMoney(createMoney("-0.001", "EUR"), ES_FORMAT)).toBe("0,00 €");
  });

  it("supports comma thousands, dot decimals, and before/after symbol placement", () => {
    expect(formatMoney(createMoney("2000", "USD"), US_BEFORE_FORMAT)).toBe(
      "$2,000.00",
    );
    expect(formatMoney(createMoney("-2000.5", "USD"), US_BEFORE_FORMAT)).toBe(
      "-$2,000.50",
    );
    expect(formatMoney(createMoney("2000", "USD"), US_AFTER_FORMAT)).toBe(
      "2,000.00 $",
    );
  });

  it("respects JPY zero decimals and BTC up to 8 decimals without trailing zeros", () => {
    expect(formatMoney(createMoney("150000", "JPY"), ES_FORMAT)).toBe(
      "150.000 ¥",
    );
    expect(formatMoney(createMoney("0.05432100", "BTC"), ES_FORMAT)).toBe(
      "0,054321 BTC",
    );
    expect(formatMoney(createMoney("1", "BTC"), ES_FORMAT)).toBe("1 BTC");
    expect(formatMoney(createMoney("0.00000001", "BTC"), ES_FORMAT)).toBe(
      "0,00000001 BTC",
    );
  });

  it("rejects conflicting thousands and decimal separators", () => {
    expect(() =>
      formatMoney(createMoney("100", "EUR"), {
        thousandsSeparator: ".",
        decimalSeparator: ".",
        symbolPosition: "after",
      }),
    ).toThrow(InvalidNumberFormatError);
  });
});

describe("formatMoneyWithBase (dual multicurrency display with parentheses)", () => {
  it("renders foreign currency followed by equivalent in base currency inside parentheses", () => {
    const amexUsd = createMoney("2000", "USD");
    expect(formatMoneyWithBase(amexUsd, "EUR", "0.90966", ES_FORMAT)).toBe(
      "2.000,00 $ (1.819,32 €)",
    );

    const jpyAccount = createMoney("150000", "JPY");
    expect(formatMoneyWithBase(jpyAccount, "EUR", "0.0061", ES_FORMAT)).toBe(
      "150.000 ¥ (915,00 €)",
    );
  });

  it("omits parentheses when money is already in the user base currency", () => {
    const eur = createMoney("1819.32", "EUR");
    expect(formatMoneyWithBase(eur, "eur", "1", ES_FORMAT)).toBe("1.819,32 €");
  });

  it("degrades gracefully without NaN when FX rate is unavailable", () => {
    const usd = createMoney("2000", "USD");
    expect(formatMoneyWithBase(usd, "EUR", null, ES_FORMAT)).toBe("2.000,00 $");
    expect(formatMoneyWithBase(usd, "EUR", undefined, ES_FORMAT)).toBe(
      "2.000,00 $",
    );
  });
});
