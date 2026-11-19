import { Decimal } from "decimal.js";
import type { AccountType } from "../contracts.js";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { normalizeCurrencyCode } from "../money/currencies.js";
import {
  formatMoney,
  formatMoneyWithBase,
  type NumberFormatPreferences,
} from "../money/format.js";
import {
  addMoney,
  createMoney,
  FinanceDecimal,
  type Money,
  parseDecimal,
} from "../money/money.js";
import type { UserPreferences } from "../user/preferences.js";

export interface AccountSummaryInput {
  readonly id: string;
  readonly name: string;
  readonly accountType: AccountType;
  readonly currency: string;
  readonly balance: string;
  readonly isArchived: boolean;
}

export interface AccountBalanceView extends AccountSummaryInput {
  readonly balanceInBase: string | null;
  readonly formattedBalance: string;
}

export interface BalancesSummary {
  readonly baseCurrency: string;
  readonly totalBalance: string;
  readonly formattedTotalBalance: string;
  readonly cashBalance: string;
  readonly formattedCashBalance: string;
  readonly byType: Readonly<Record<AccountType, string>>;
  readonly missingFxCurrencies: readonly string[];
  readonly accounts: readonly AccountBalanceView[];
}

function getPivotRate(
  snapshot: FxRateSnapshot,
  currency: string,
): Decimal | null {
  const pivot = normalizeCurrencyCode(snapshot.pivotCurrency);
  if (currency === pivot) {
    return new FinanceDecimal(1);
  }
  const rate = snapshot.rates[currency];
  return rate ? parseDecimal(rate) : null;
}

function convertWithExactPivotRatio(
  money: Money,
  baseCurrency: string,
  fxSnapshot: FxRateSnapshot | undefined,
): { converted: Money; effectiveRate: string } | null {
  const source = normalizeCurrencyCode(money.currency);
  const target = normalizeCurrencyCode(baseCurrency);
  if (source === target) {
    return { converted: createMoney(money.amount, target), effectiveRate: "1" };
  }
  if (!fxSnapshot) {
    return null;
  }

  const fromPivot = getPivotRate(fxSnapshot, source);
  const toPivot = getPivotRate(fxSnapshot, target);
  if (!fromPivot || !toPivot) {
    return null;
  }

  const exactAmount = parseDecimal(money.amount)
    .times(toPivot)
    .dividedBy(fromPivot)
    .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  const canonicalAmount = exactAmount
    .toFixed()
    .replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");

  const effectiveRate = toPivot
    .dividedBy(fromPivot)
    .toDecimalPlaces(12, Decimal.ROUND_HALF_UP)
    .toFixed()
    .replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");

  return {
    converted: createMoney(canonicalAmount, target),
    effectiveRate,
  };
}

export function computeBalancesSummary(
  accounts: readonly AccountSummaryInput[],
  preferences: UserPreferences,
  fxSnapshot?: FxRateSnapshot,
): BalancesSummary {
  const baseCurrency = normalizeCurrencyCode(preferences.baseCurrency);
  const numberFormat: NumberFormatPreferences = {
    thousandsSeparator: preferences.thousandsSeparator,
    decimalSeparator: preferences.decimalSeparator,
    symbolPosition: preferences.symbolPosition,
  };

  let total = createMoney("0", baseCurrency);
  const byTypeMoney: Record<AccountType, Money> = {
    bank: createMoney("0", baseCurrency),
    cash: createMoney("0", baseCurrency),
    savings: createMoney("0", baseCurrency),
    credit: createMoney("0", baseCurrency),
  };
  const missingSet = new Set<string>();
  const views: AccountBalanceView[] = [];

  for (const account of accounts) {
    const currency = normalizeCurrencyCode(account.currency);
    const nativeMoney = createMoney(account.balance, currency);
    const conversion = convertWithExactPivotRatio(
      nativeMoney,
      baseCurrency,
      fxSnapshot,
    );

    const formattedBalance = conversion
      ? formatMoneyWithBase(
          nativeMoney,
          baseCurrency,
          conversion.effectiveRate,
          numberFormat,
        )
      : formatMoney(nativeMoney, numberFormat);

    views.push({
      ...account,
      currency,
      balance: nativeMoney.amount,
      balanceInBase: conversion ? conversion.converted.amount : null,
      formattedBalance,
    });

    if (account.isArchived) {
      continue;
    }

    if (conversion) {
      total = addMoney(total, conversion.converted);
      byTypeMoney[account.accountType] = addMoney(
        byTypeMoney[account.accountType],
        conversion.converted,
      );
    } else {
      missingSet.add(currency);
    }
  }

  return {
    baseCurrency,
    totalBalance: total.amount,
    formattedTotalBalance: formatMoney(total, numberFormat),
    cashBalance: byTypeMoney.cash.amount,
    formattedCashBalance: formatMoney(byTypeMoney.cash, numberFormat),
    byType: {
      bank: byTypeMoney.bank.amount,
      cash: byTypeMoney.cash.amount,
      savings: byTypeMoney.savings.amount,
      credit: byTypeMoney.credit.amount,
    },
    missingFxCurrencies: [...missingSet].sort(),
    accounts: views,
  };
}
