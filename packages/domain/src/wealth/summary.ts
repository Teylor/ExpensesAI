import { Decimal } from "decimal.js";
import type { NetWorthKind } from "../commands/catalog.js";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { getCurrencyInfo, normalizeCurrencyCode } from "../money/currencies.js";
import {
  formatMoney,
  formatMoneyWithBase,
  type NumberFormatPreferences,
} from "../money/format.js";
import {
  addMoney,
  createMoney,
  FinanceDecimal,
  parseDecimal,
  subtractMoney,
} from "../money/money.js";
import type { UserPreferences } from "../user/preferences.js";

export interface InvestmentSummaryInput {
  readonly id: string;
  readonly assetType: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly quantity: string | null;
  readonly investedAmount: string;
  readonly currentValue: string;
  readonly currency: string;
}

export interface InvestmentView extends InvestmentSummaryInput {
  readonly investedInBase: string | null;
  readonly currentValueInBase: string | null;
  readonly formattedInvestedAmount: string;
  readonly formattedCurrentValue: string;
  readonly unrealizedPnl: string;
  readonly unrealizedPnlPercent: string;
}

export interface InvestmentsSummary {
  readonly baseCurrency: string;
  readonly totalInvested: string;
  readonly formattedTotalInvested: string;
  readonly totalCurrentValue: string;
  readonly formattedTotalCurrentValue: string;
  readonly unrealizedPnl: string;
  readonly formattedUnrealizedPnl: string;
  readonly unrealizedPnlPercent: string;
  readonly missingFxCurrencies: readonly string[];
  readonly items: readonly InvestmentView[];
}

export interface NetWorthSummaryInput {
  readonly id: string;
  readonly kind: NetWorthKind;
  readonly category: string;
  readonly name: string;
  readonly estimatedValue: string;
  readonly currency: string;
}

export interface NetWorthItemView extends NetWorthSummaryInput {
  readonly valueInBase: string | null;
  readonly formattedValue: string;
}

export interface NetWorthSummary {
  readonly baseCurrency: string;
  readonly totalLiquidAccounts: string;
  readonly formattedTotalLiquidAccounts: string;
  readonly totalInvestments: string;
  readonly formattedTotalInvestments: string;
  readonly totalIlliquidAssets: string;
  readonly formattedTotalIlliquidAssets: string;
  readonly totalAssets: string;
  readonly formattedTotalAssets: string;
  readonly totalLiabilities: string;
  readonly formattedTotalLiabilities: string;
  readonly netWorth: string;
  readonly formattedNetWorth: string;
  readonly missingFxCurrencies: readonly string[];
  readonly items: readonly NetWorthItemView[];
}

function toCanonical(value: Decimal, maxDecimals: number): string {
  const fixed = value
    .toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP)
    .toFixed(maxDecimals);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

function getPivotRate(
  snapshot: FxRateSnapshot,
  currency: string,
): Decimal | null {
  const pivot = normalizeCurrencyCode(snapshot.pivotCurrency);
  if (currency === pivot) return new FinanceDecimal(1);
  const raw = snapshot.rates[currency];
  return raw ? parseDecimal(raw) : null;
}

function convertToBaseExact(
  amount: string,
  currency: string,
  baseCurrency: string,
  fxSnapshot?: FxRateSnapshot,
): { converted: string; effectiveRate: string } | null {
  const src = normalizeCurrencyCode(currency);
  const dst = normalizeCurrencyCode(baseCurrency);
  const money = createMoney(amount, src);

  if (src === dst) {
    return { converted: money.amount, effectiveRate: "1" };
  }
  if (!fxSnapshot) return null;

  const fromPivot = getPivotRate(fxSnapshot, src);
  const toPivot = getPivotRate(fxSnapshot, dst);
  if (!fromPivot || !toPivot) return null;

  const maxDecimals = getCurrencyInfo(dst).maxDecimals;
  const converted = toCanonical(
    parseDecimal(money.amount).times(toPivot).dividedBy(fromPivot),
    maxDecimals,
  );
  const effectiveRate = toCanonical(toPivot.dividedBy(fromPivot), 12);

  return { converted, effectiveRate };
}

function numberFormatFromPrefs(
  prefs: UserPreferences,
): NumberFormatPreferences {
  return {
    thousandsSeparator: prefs.thousandsSeparator,
    decimalSeparator: prefs.decimalSeparator,
    symbolPosition: prefs.symbolPosition,
  };
}

export function computeInvestmentsSummary(
  investments: readonly InvestmentSummaryInput[],
  preferences: UserPreferences,
  fxSnapshot?: FxRateSnapshot,
): InvestmentsSummary {
  const baseCurrency = normalizeCurrencyCode(preferences.baseCurrency);
  const numberFormat = numberFormatFromPrefs(preferences);
  const missingSet = new Set<string>();

  let totalInvested = createMoney("0", baseCurrency);
  let totalCurrentValue = createMoney("0", baseCurrency);
  const items: InvestmentView[] = [];

  for (const inv of investments) {
    const currency = normalizeCurrencyCode(inv.currency);
    const invMoney = createMoney(inv.investedAmount, currency);
    const curMoney = createMoney(inv.currentValue, currency);
    const itemPnl = subtractMoney(curMoney, invMoney);
    const invDec = parseDecimal(invMoney.amount);
    const itemPnlPct = invDec.gt(0)
      ? toCanonical(parseDecimal(itemPnl.amount).div(invDec).times(100), 2)
      : "0";

    const invConv = convertToBaseExact(
      invMoney.amount,
      currency,
      baseCurrency,
      fxSnapshot,
    );
    const curConv = convertToBaseExact(
      curMoney.amount,
      currency,
      baseCurrency,
      fxSnapshot,
    );

    if (invConv && curConv) {
      totalInvested = addMoney(
        totalInvested,
        createMoney(invConv.converted, baseCurrency),
      );
      totalCurrentValue = addMoney(
        totalCurrentValue,
        createMoney(curConv.converted, baseCurrency),
      );
    } else if (currency !== baseCurrency) {
      missingSet.add(currency);
    }

    items.push({
      ...inv,
      currency,
      investedAmount: invMoney.amount,
      currentValue: curMoney.amount,
      investedInBase: invConv?.converted ?? null,
      currentValueInBase: curConv?.converted ?? null,
      formattedInvestedAmount: formatMoneyWithBase(
        invMoney,
        baseCurrency,
        invConv?.effectiveRate,
        numberFormat,
      ),
      formattedCurrentValue: formatMoneyWithBase(
        curMoney,
        baseCurrency,
        curConv?.effectiveRate,
        numberFormat,
      ),
      unrealizedPnl: itemPnl.amount,
      unrealizedPnlPercent: itemPnlPct,
    });
  }

  const totalPnl = subtractMoney(totalCurrentValue, totalInvested);
  const totalInvDec = parseDecimal(totalInvested.amount);
  const totalPnlPct = totalInvDec.gt(0)
    ? toCanonical(parseDecimal(totalPnl.amount).div(totalInvDec).times(100), 2)
    : "0";

  return {
    baseCurrency,
    totalInvested: totalInvested.amount,
    formattedTotalInvested: formatMoney(totalInvested, numberFormat),
    totalCurrentValue: totalCurrentValue.amount,
    formattedTotalCurrentValue: formatMoney(totalCurrentValue, numberFormat),
    unrealizedPnl: totalPnl.amount,
    formattedUnrealizedPnl: formatMoney(totalPnl, numberFormat),
    unrealizedPnlPercent: totalPnlPct,
    missingFxCurrencies: [...missingSet].sort(),
    items,
  };
}

export function computeNetWorthSummary(
  liquidAccountsTotalBase: string,
  investmentsTotalBase: string,
  netWorthItems: readonly NetWorthSummaryInput[],
  preferences: UserPreferences,
  fxSnapshot?: FxRateSnapshot,
): NetWorthSummary {
  const baseCurrency = normalizeCurrencyCode(preferences.baseCurrency);
  const numberFormat = numberFormatFromPrefs(preferences);
  const missingSet = new Set<string>();

  const liquidMoney = createMoney(liquidAccountsTotalBase, baseCurrency);
  const investmentsMoney = createMoney(investmentsTotalBase, baseCurrency);
  let illiquidAssetsMoney = createMoney("0", baseCurrency);
  let liabilitiesMoney = createMoney("0", baseCurrency);

  const items: NetWorthItemView[] = [];

  for (const item of netWorthItems) {
    const currency = normalizeCurrencyCode(item.currency);
    const valMoney = createMoney(item.estimatedValue, currency);
    const conv = convertToBaseExact(
      valMoney.amount,
      currency,
      baseCurrency,
      fxSnapshot,
    );

    if (conv) {
      const baseVal = createMoney(conv.converted, baseCurrency);
      if (item.kind === "asset") {
        illiquidAssetsMoney = addMoney(illiquidAssetsMoney, baseVal);
      } else {
        liabilitiesMoney = addMoney(liabilitiesMoney, baseVal);
      }
    } else if (currency !== baseCurrency) {
      missingSet.add(currency);
    }

    items.push({
      ...item,
      currency,
      estimatedValue: valMoney.amount,
      valueInBase: conv?.converted ?? null,
      formattedValue: formatMoneyWithBase(
        valMoney,
        baseCurrency,
        conv?.effectiveRate,
        numberFormat,
      ),
    });
  }

  const totalAssetsMoney = addMoney(
    addMoney(liquidMoney, investmentsMoney),
    illiquidAssetsMoney,
  );
  const netWorthMoney = subtractMoney(totalAssetsMoney, liabilitiesMoney);

  return {
    baseCurrency,
    totalLiquidAccounts: liquidMoney.amount,
    formattedTotalLiquidAccounts: formatMoney(liquidMoney, numberFormat),
    totalInvestments: investmentsMoney.amount,
    formattedTotalInvestments: formatMoney(investmentsMoney, numberFormat),
    totalIlliquidAssets: illiquidAssetsMoney.amount,
    formattedTotalIlliquidAssets: formatMoney(
      illiquidAssetsMoney,
      numberFormat,
    ),
    totalAssets: totalAssetsMoney.amount,
    formattedTotalAssets: formatMoney(totalAssetsMoney, numberFormat),
    totalLiabilities: liabilitiesMoney.amount,
    formattedTotalLiabilities: formatMoney(liabilitiesMoney, numberFormat),
    netWorth: netWorthMoney.amount,
    formattedNetWorth: formatMoney(netWorthMoney, numberFormat),
    missingFxCurrencies: [...missingSet].sort(),
    items,
  };
}
