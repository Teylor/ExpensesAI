import { Decimal } from "decimal.js";
import { getCurrencyInfo, normalizeCurrencyCode } from "./currencies.js";
import {
  convertMoney,
  type DecimalInput,
  type Money,
  parseDecimal,
} from "./money.js";

export type ThousandsSeparator = "." | "," | " " | "";
export type DecimalSeparator = "," | ".";
export type SymbolPosition = "after" | "before";

export interface NumberFormatPreferences {
  readonly thousandsSeparator: ThousandsSeparator;
  readonly decimalSeparator: DecimalSeparator;
  readonly symbolPosition?: SymbolPosition;
}

export const DEFAULT_NUMBER_FORMAT: Required<NumberFormatPreferences> = {
  thousandsSeparator: ".",
  decimalSeparator: ",",
  symbolPosition: "after",
};

export class InvalidNumberFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNumberFormatError";
  }
}

function resolvePreferences(
  preferences?: NumberFormatPreferences,
): Required<NumberFormatPreferences> {
  const resolved: Required<NumberFormatPreferences> = {
    thousandsSeparator:
      preferences?.thousandsSeparator ??
      DEFAULT_NUMBER_FORMAT.thousandsSeparator,
    decimalSeparator:
      preferences?.decimalSeparator ?? DEFAULT_NUMBER_FORMAT.decimalSeparator,
    symbolPosition:
      preferences?.symbolPosition ?? DEFAULT_NUMBER_FORMAT.symbolPosition,
  };

  if (
    resolved.thousandsSeparator !== "" &&
    resolved.thousandsSeparator === resolved.decimalSeparator
  ) {
    throw new InvalidNumberFormatError(
      `thousandsSeparator ("${resolved.thousandsSeparator}") and decimalSeparator ("${resolved.decimalSeparator}") must be different`,
    );
  }

  return resolved;
}

function groupThousands(
  integerDigits: string,
  separator: ThousandsSeparator,
): string {
  if (separator === "") {
    return integerDigits;
  }
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatMoney(
  money: Money,
  preferences?: NumberFormatPreferences,
): string {
  const prefs = resolvePreferences(preferences);
  const currencyInfo = getCurrencyInfo(money.currency);

  const raw = parseDecimal(money.amount);
  const rounded = raw.toDecimalPlaces(
    currencyInfo.maxDecimals,
    Decimal.ROUND_HALF_UP,
  );
  const isNegative = rounded.isNegative() && !rounded.isZero();
  const absValue = rounded.abs();

  const fixed = absValue.toFixed(currencyInfo.maxDecimals);
  const [rawInt = "0", rawFrac = ""] = fixed.split(".");

  let trimmedFrac = rawFrac;
  if (currencyInfo.maxDecimals > currencyInfo.minDecimals) {
    trimmedFrac = rawFrac.replace(/0+$/, "");
    if (trimmedFrac.length < currencyInfo.minDecimals) {
      trimmedFrac = trimmedFrac.padEnd(currencyInfo.minDecimals, "0");
    }
  }

  const groupedInt = groupThousands(rawInt, prefs.thousandsSeparator);
  const numericText =
    trimmedFrac.length > 0
      ? `${groupedInt}${prefs.decimalSeparator}${trimmedFrac}`
      : groupedInt;

  const sign = isNegative ? "-" : "";

  if (prefs.symbolPosition === "before") {
    const spacer = currencyInfo.symbol.length > 1 ? " " : "";
    return `${sign}${currencyInfo.symbol}${spacer}${numericText}`;
  }

  return `${sign}${numericText} ${currencyInfo.symbol}`;
}

export function formatMoneyWithBase(
  money: Money,
  baseCurrency: string,
  fxRateToBase: DecimalInput | null | undefined,
  preferences?: NumberFormatPreferences,
): string {
  const primaryText = formatMoney(money, preferences);
  const sourceCurrency = normalizeCurrencyCode(money.currency);
  const normalizedBase = normalizeCurrencyCode(baseCurrency);

  if (sourceCurrency === normalizedBase || fxRateToBase == null) {
    return primaryText;
  }

  const converted = convertMoney(money, normalizedBase, fxRateToBase);
  const baseText = formatMoney(converted, preferences);
  return `${primaryText} (${baseText})`;
}
