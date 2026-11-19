import { Decimal } from "decimal.js";
import { normalizeCurrencyCode } from "./currencies.js";

export const FinanceDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
});

export type DecimalInput = string | Decimal;

export interface Money {
  readonly amount: string;
  readonly currency: string;
}

export class InvalidAmountError extends Error {
  constructor(rawValue: string) {
    super(`Invalid decimal amount: "${rawValue}"`);
    this.name = "InvalidAmountError";
  }
}

export class CurrencyMismatchError extends Error {
  readonly leftCurrency: string;
  readonly rightCurrency: string;

  constructor(leftCurrency: string, rightCurrency: string) {
    super(
      `Currency mismatch: cannot combine ${leftCurrency} with ${rightCurrency} without explicit conversion`,
    );
    this.name = "CurrencyMismatchError";
    this.leftCurrency = leftCurrency;
    this.rightCurrency = rightCurrency;
  }
}

export class InvalidFxRateError extends Error {
  constructor(rawRate: string) {
    super(
      `Invalid FX rate (must be a strictly positive decimal): "${rawRate}"`,
    );
    this.name = "InvalidFxRateError";
  }
}

export const CANONICAL_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function parseDecimal(input: DecimalInput): Decimal {
  if (input instanceof Decimal) {
    if (!input.isFinite()) {
      throw new InvalidAmountError(input.toString());
    }
    return new FinanceDecimal(input);
  }

  const trimmed = input.trim();
  if (!CANONICAL_DECIMAL_PATTERN.test(trimmed)) {
    throw new InvalidAmountError(input);
  }

  const parsed = new FinanceDecimal(trimmed);
  if (!parsed.isFinite()) {
    throw new InvalidAmountError(input);
  }
  return parsed;
}

function normalizeDecimalToString(value: Decimal): string {
  if (value.isZero()) {
    return "0";
  }
  return value.toFixed();
}

export function createMoney(amount: DecimalInput, currency: string): Money {
  const parsedAmount = parseDecimal(amount);
  const normalizedCurrency = normalizeCurrencyCode(currency);
  return {
    amount: normalizeDecimalToString(parsedAmount),
    currency: normalizedCurrency,
  };
}

function assertSameCurrency(a: Money, b: Money): void {
  const left = normalizeCurrencyCode(a.currency);
  const right = normalizeCurrencyCode(b.currency);
  if (left !== right) {
    throw new CurrencyMismatchError(left, right);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const sum = parseDecimal(a.amount).plus(parseDecimal(b.amount));
  return createMoney(sum, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const diff = parseDecimal(a.amount).minus(parseDecimal(b.amount));
  return createMoney(diff, a.currency);
}

export function negateMoney(money: Money): Money {
  const negated = parseDecimal(money.amount).negated();
  return createMoney(negated, money.currency);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  const cmp = parseDecimal(a.amount).comparedTo(parseDecimal(b.amount));
  if (cmp < 0) return -1;
  if (cmp > 0) return 1;
  return 0;
}

export function isZeroMoney(money: Money): boolean {
  return parseDecimal(money.amount).isZero();
}

export function isPositiveMoney(money: Money): boolean {
  return parseDecimal(money.amount).greaterThan(0);
}

export function isNegativeMoney(money: Money): boolean {
  return parseDecimal(money.amount).lessThan(0);
}

export function sumMoney(items: readonly Money[], currency: string): Money {
  const targetCurrency = normalizeCurrencyCode(currency);
  let total = new FinanceDecimal(0);

  for (const item of items) {
    const itemCurrency = normalizeCurrencyCode(item.currency);
    if (itemCurrency !== targetCurrency) {
      throw new CurrencyMismatchError(targetCurrency, itemCurrency);
    }
    total = total.plus(parseDecimal(item.amount));
  }

  return createMoney(total, targetCurrency);
}

export function toDbNumericString(money: Money): string {
  const value = parseDecimal(money.amount);
  const rounded = value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  return rounded.toFixed(8);
}

export function convertMoney(
  money: Money,
  targetCurrency: string,
  fxRate: DecimalInput,
): Money {
  const sourceCurrency = normalizeCurrencyCode(money.currency);
  const normalizedTarget = normalizeCurrencyCode(targetCurrency);

  let parsedRate: Decimal;
  try {
    parsedRate = parseDecimal(fxRate);
  } catch {
    throw new InvalidFxRateError(String(fxRate));
  }

  if (parsedRate.lessThanOrEqualTo(0)) {
    throw new InvalidFxRateError(String(fxRate));
  }

  if (sourceCurrency === normalizedTarget) {
    return createMoney(money.amount, normalizedTarget);
  }

  const converted = parseDecimal(money.amount)
    .times(parsedRate)
    .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

  const canonical = converted.toFixed().replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return createMoney(canonical, normalizedTarget);
}
